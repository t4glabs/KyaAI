require('dotenv').config();
const { db } = require('./lib/db');
const { strapiGet, slugify } = require('./lib/strapi');

/**
 * One-off for the Strapi 4 → 5 upgrade: runs pushed before
 * runs.strapi_document_id existed only have the numeric strapi_entry_id,
 * which Strapi 5's single-entry routes reject — so the poller can't follow
 * them. This resolves each one to its documentId and fills the column in.
 *
 *   node src/backfill-document-ids.js           # dry run, prints what it would do
 *   node src/backfill-document-ids.js --apply   # writes it
 *
 * Only ever fills a NULL strapi_document_id; never overwrites one. Match
 * strategies, in order:
 *   1. filters[id] = strapi_entry_id — v4-era ids were carried over by the
 *      migration, as long as the document hasn't been re-published since
 *      (Strapi 5 gives every draft/published version its own numeric id).
 *   2. createdAt within the 2 minutes before pushed_at — a create push sets
 *      pushed_at right after Strapi creates the document, and createdAt is
 *      stable across re-publishes. Accepted only if exactly one matches.
 *   3. Companies only: slug of the pushed name — covers upsert *updates* of
 *      an existing company, where createdAt is long before the push.
 * Anything still ambiguous is left NULL and listed, rather than guessed.
 *
 * Then does the same for link_dismissals, link_check_results and
 * quality_check_results, which were keyed by the numeric job id. Those
 * resolve by slug first (stable across re-publishes), then by numeric id,
 * against one bulk fetch of every job.
 */
const APPLY = process.argv.includes('--apply');
const CREATED_WINDOW_MS = 2 * 60 * 1000;

async function findOne(plural, query) {
  for (const status of ['draft', 'published']) {
    const { data } = await strapiGet(`/${plural}?status=${status}&${query}&fields[0]=createdAt&pagination[pageSize]=5`);
    if (data && data.length > 0) return data;
  }
  return [];
}

async function resolve(run) {
  const plural = run.strapi_content_type === 'job' ? 'jobs' : 'companies';
  const pushedAt = new Date(run.pushed_at).getTime();

  const byId = await findOne(plural, `filters[id][$eq]=${run.strapi_entry_id}`);
  if (byId.length === 1 && new Date(byId[0].createdAt).getTime() <= pushedAt + 5000) {
    return { documentId: byId[0].documentId, via: 'id' };
  }

  const from = new Date(pushedAt - CREATED_WINDOW_MS).toISOString();
  const to = new Date(pushedAt + 5000).toISOString();
  const byCreated = await findOne(plural, `filters[createdAt][$gte]=${from}&filters[createdAt][$lte]=${to}`);
  const distinct = [...new Set(byCreated.map((e) => e.documentId))];
  if (distinct.length === 1) {
    return { documentId: distinct[0], via: 'createdAt' };
  }

  if (run.strapi_content_type === 'company') {
    const name = JSON.parse(run.pushed_metadata || '{}').name;
    if (name) {
      const bySlug = await findOne(plural, `filters[slug][$eq]=${encodeURIComponent(slugify(name))}`);
      if (bySlug.length === 1) return { documentId: bySlug[0].documentId, via: 'slug' };
    }
  }

  return { documentId: null, via: distinct.length > 1 ? `ambiguous (${distinct.length} created in window)` : 'not found' };
}

async function main() {
  const runs = db.prepare(`
    SELECT id, strapi_entry_id, strapi_content_type, pushed_at, pushed_metadata
    FROM runs
    WHERE strapi_entry_id IS NOT NULL AND strapi_document_id IS NULL
    ORDER BY id
  `).all();
  console.log(`${runs.length} pushed run(s) without a documentId${APPLY ? '' : ' (dry run — pass --apply to write)'}`);

  const update = db.prepare('UPDATE runs SET strapi_document_id = ? WHERE id = ? AND strapi_document_id IS NULL');
  const counts = {};
  const unresolved = [];
  for (const run of runs) {
    const { documentId, via } = await resolve(run);
    counts[via] = (counts[via] || 0) + 1;
    if (documentId) {
      if (APPLY) update.run(documentId, run.id);
    } else {
      unresolved.push(`run ${run.id} (${run.strapi_content_type} #${run.strapi_entry_id}, pushed ${run.pushed_at}): ${via}`);
    }
  }

  console.log('Resolved by:', counts);
  if (unresolved.length > 0) {
    console.log(`Left unresolved (${unresolved.length}) — most likely deleted from Strapi:`);
    for (const line of unresolved) console.log(`  ${line}`);
  }

  await backfillJobKeyedTables();
}

/** slug → documentId and numeric id → documentId for every job, across both
 * draft and published versions. Slugs that map to more than one document
 * are dropped as ambiguous. */
async function loadJobIndex() {
  const bySlug = new Map();
  const ambiguous = new Set();
  const byId = new Map();
  for (const status of ['draft', 'published']) {
    for (let page = 1; ; page += 1) {
      const { data, meta } = await strapiGet(`/jobs?status=${status}&fields[0]=slug&pagination[pageSize]=100&pagination[page]=${page}`);
      for (const e of data) {
        byId.set(e.id, e.documentId);
        if (!e.slug) continue;
        if (bySlug.has(e.slug) && bySlug.get(e.slug) !== e.documentId) ambiguous.add(e.slug);
        bySlug.set(e.slug, e.documentId);
      }
      if (page >= (meta?.pagination?.pageCount ?? 1)) break;
    }
  }
  for (const slug of ambiguous) bySlug.delete(slug);
  return { bySlug, byId };
}

async function backfillJobKeyedTables() {
  const { bySlug, byId } = await loadJobIndex();
  const resolveJob = (slug, jobId) => (slug && bySlug.get(slug)) || byId.get(jobId) || null;

  for (const table of ['link_check_results', 'quality_check_results']) {
    const rows = db.prepare(`SELECT id, job_id, slug FROM ${table} WHERE document_id IS NULL`).all();
    const update = db.prepare(`UPDATE ${table} SET document_id = ? WHERE id = ? AND document_id IS NULL`);
    let resolved = 0;
    db.transaction(() => {
      for (const r of rows) {
        const documentId = resolveJob(r.slug, r.job_id);
        if (!documentId) continue;
        resolved += 1;
        if (APPLY) update.run(documentId, r.id);
      }
    })();
    console.log(`${table}: ${resolved}/${rows.length} row(s) resolved`);
  }

  // Dismissals don't store a slug — take it from the latest link-check
  // result for the same job_id.
  const dismissals = db.prepare(`
    SELECT d.rowid AS rowid, d.job_id, d.dismissed_at,
      (SELECT slug FROM link_check_results r WHERE r.job_id = d.job_id AND r.slug IS NOT NULL ORDER BY r.id DESC LIMIT 1) AS slug
    FROM link_dismissals d
    WHERE d.document_id IS NULL
  `).all();
  const existing = db.prepare('SELECT rowid, dismissed_at FROM link_dismissals WHERE document_id = ?');
  const setDoc = db.prepare('UPDATE link_dismissals SET document_id = ? WHERE rowid = ?');
  const remove = db.prepare('DELETE FROM link_dismissals WHERE rowid = ?');
  const stats = { resolved: 0, mergedDuplicates: 0, unresolved: [] };
  db.transaction(() => {
    for (const d of dismissals) {
      const documentId = resolveJob(d.slug, d.job_id);
      if (!documentId) {
        stats.unresolved.push(`job #${d.job_id}${d.slug ? ` (${d.slug})` : ''}`);
        continue;
      }
      stats.resolved += 1;
      if (!APPLY) continue;
      // The same job dismissed under two numeric ids (re-published in
      // between) — keep the more recent dismissal.
      const other = existing.get(documentId);
      if (other) {
        stats.mergedDuplicates += 1;
        if (other.dismissed_at >= d.dismissed_at) {
          remove.run(d.rowid);
          continue;
        }
        remove.run(other.rowid);
      }
      setDoc.run(documentId, d.rowid);
    }
  })();
  console.log(`link_dismissals: ${stats.resolved}/${dismissals.length} resolved, ${stats.mergedDuplicates} duplicate(s) merged`);
  if (stats.unresolved.length > 0) {
    console.log(`  left as-is (still matched by numeric id): ${stats.unresolved.join(', ')}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
