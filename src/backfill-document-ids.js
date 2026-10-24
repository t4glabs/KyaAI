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
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
