const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// Overridable so test/dev runs never touch the real operational database —
// a lesson learned the hard way: earlier local testing reused the real
// data/ folder and .env and ended up wiping a real logged run.
const DATA_DIR = process.env.COMPOSER_DATA_DIR || path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(path.join(DATA_DIR, 'composer.sqlite'));

db.exec(`
  CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,               -- 'job' or 'company'
    prompt_version TEXT NOT NULL,
    created_at TEXT NOT NULL,
    source_text TEXT NOT NULL,
    ai_metadata TEXT NOT NULL,        -- JSON string: Claude's original draft, untouched
    ai_description TEXT NOT NULL,     -- Claude's original markdown draft, untouched

    strapi_entry_id INTEGER,          -- set once pushed to Strapi
    strapi_content_type TEXT,         -- 'job' or 'company', for building admin links later
    pushed_at TEXT,                   -- set once pushed to Strapi
    pushed_metadata TEXT,             -- JSON string: what was actually sent (after in-tool edits)
    pushed_description TEXT,          -- what was actually sent (after in-tool edits)

    published_at TEXT,                -- set once the poller detects it went live in Strapi
    final_metadata TEXT,              -- JSON string: field values at the moment it was published
    final_description TEXT            -- description at the moment it was published
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,       -- e.g. "LinkedIn — NGO Program Manager roles"
    url TEXT NOT NULL,         -- the actual link to open — a reference, never fetched by this tool
    category TEXT,             -- freeform grouping, e.g. "LinkedIn", "DevNetJobsIndia", "Career page"
    created_at TEXT NOT NULL,
    checked_at TEXT            -- set when marked done for the current round; cleared on reset
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS link_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    total INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'running',  -- 'running' | 'done'
    error TEXT                               -- set if the check failed before producing any results
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS link_check_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    check_id INTEGER NOT NULL,
    job_id INTEGER NOT NULL,
    title TEXT,
    slug TEXT,
    application_url TEXT NOT NULL,
    ok INTEGER NOT NULL,          -- 0/1 — 0 means "couldn't verify," not "definitely dead"
    status_code INTEGER,
    error TEXT,
    checked_at TEXT NOT NULL
  );
`);

// Keyed by Strapi documentId: in Strapi 5 a job's numeric id changes every
// time it's re-published, which would silently drop its dismissal.
const LINK_DISMISSALS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS link_dismissals (
    document_id TEXT UNIQUE,      -- one dismissal per job (Strapi documentId), not per check run
    job_id INTEGER,               -- numeric id at dismissal time; only used to match rows saved
                                  -- before document_id existed and not yet backfilled
    application_url TEXT,         -- the exact link that was dismissed — see getLatestLinkCheck
    dismissed_at TEXT NOT NULL,
    note TEXT                     -- freeform, e.g. "known bit.ly false positive, verified working"
  );
`;
db.exec(LINK_DISMISSALS_SCHEMA);

db.exec(`
  CREATE TABLE IF NOT EXISTS quality_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    total INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'running',
    error TEXT
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS quality_check_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    check_id INTEGER NOT NULL,
    job_id INTEGER NOT NULL,
    title TEXT,
    slug TEXT,
    job_updated_at TEXT,           -- Strapi's updatedAt at audit time — lets a later run
                                    -- skip re-auditing a job that hasn't changed since
    content_prompt_version TEXT,
    content_scores TEXT,           -- JSON: {writingQuality, genderNeutralLanguage, selfContained, completeness, overall}
    content_issues TEXT,           -- JSON: [{dimension, quote, problem, replacement}] — quote verified against real text; replacement is paste-ready text, not advice
    content_strengths TEXT,        -- JSON: [string]
    content_summary TEXT,
    content_error TEXT,            -- set if content scoring failed for this job
    lighthouse_scores TEXT,        -- JSON: {performance, accessibility, bestPractices, seo}
    lighthouse_tips TEXT,          -- JSON: [{id, title, description, score}] — verbatim from Lighthouse
    lighthouse_error TEXT,         -- set if the Lighthouse audit failed for this job
    checked_at TEXT NOT NULL
  );
`);

// CREATE TABLE IF NOT EXISTS won't add columns to a table that already
// existed from an earlier version of this tool — add any missing ones.
const NEW_COLUMNS = {
  strapi_content_type: 'TEXT',
  pushed_at: 'TEXT',
  pushed_metadata: 'TEXT',
  pushed_description: 'TEXT',
  // Strapi 5 single-entry routes and admin links need the documentId; the
  // numeric strapi_entry_id is per-version there and changes on republish.
  strapi_document_id: 'TEXT',
};
const existingColumns = new Set(db.prepare('PRAGMA table_info(runs)').all().map((c) => c.name));
for (const [column, sqlType] of Object.entries(NEW_COLUMNS)) {
  if (!existingColumns.has(column)) {
    db.exec(`ALTER TABLE runs ADD COLUMN ${column} ${sqlType}`);
  }
}

const existingLinkCheckColumns = new Set(db.prepare('PRAGMA table_info(link_checks)').all().map((c) => c.name));
if (!existingLinkCheckColumns.has('error')) {
  db.exec(`ALTER TABLE link_checks ADD COLUMN error TEXT`);
}

const existingDismissalColumns = new Set(db.prepare('PRAGMA table_info(link_dismissals)').all().map((c) => c.name));
if (!existingDismissalColumns.has('note')) {
  db.exec(`ALTER TABLE link_dismissals ADD COLUMN note TEXT`);
  existingDismissalColumns.add('note');
}
// The pre-Strapi-5 table had job_id as its PRIMARY KEY, which ADD COLUMN
// can't change — rebuild it once with the documentId-keyed schema, keeping
// every row. document_id starts NULL; backfill-document-ids.js fills it in.
if (!existingDismissalColumns.has('document_id')) {
  db.transaction(() => {
    db.exec('ALTER TABLE link_dismissals RENAME TO link_dismissals_v4');
    db.exec(LINK_DISMISSALS_SCHEMA);
    db.exec(`
      INSERT INTO link_dismissals (job_id, application_url, dismissed_at, note)
      SELECT job_id, application_url, dismissed_at, note FROM link_dismissals_v4
    `);
    db.exec('DROP TABLE link_dismissals_v4');
  })();
}

// Stored alongside job_id so the "open in Strapi" links can use the Strapi 5
// documentId. Rows saved before this column existed have it NULL.
for (const table of ['link_check_results', 'quality_check_results']) {
  const columns = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
  if (!columns.has('document_id')) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN document_id TEXT`);
  }
}

function insertRun({ type, promptVersion, sourceText, metadata, description }) {
  const stmt = db.prepare(`
    INSERT INTO runs (type, prompt_version, created_at, source_text, ai_metadata, ai_description)
    VALUES (@type, @promptVersion, @createdAt, @sourceText, @aiMetadata, @aiDescription)
  `);
  const info = stmt.run({
    type,
    promptVersion,
    createdAt: new Date().toISOString(),
    sourceText,
    aiMetadata: JSON.stringify(metadata),
    aiDescription: description,
  });
  return info.lastInsertRowid;
}

function markPushed(runId, { strapiEntryId, strapiDocumentId, contentType, metadata, description }) {
  db.prepare(`
    UPDATE runs
    SET strapi_entry_id = @strapiEntryId,
        strapi_document_id = @strapiDocumentId,
        strapi_content_type = @contentType,
        pushed_at = @pushedAt,
        pushed_metadata = @pushedMetadata,
        pushed_description = @pushedDescription
    WHERE id = @runId
  `).run({
    runId,
    strapiEntryId,
    strapiDocumentId: strapiDocumentId || null,
    contentType,
    pushedAt: new Date().toISOString(),
    pushedMetadata: JSON.stringify(metadata),
    pushedDescription: description,
  });
}

function markPublished(runId, { metadata, description }) {
  db.prepare(`
    UPDATE runs
    SET published_at = @publishedAt,
        final_metadata = @finalMetadata,
        final_description = @finalDescription
    WHERE id = @runId
  `).run({
    runId,
    publishedAt: new Date().toISOString(),
    finalMetadata: JSON.stringify(metadata),
    finalDescription: description,
  });
}

function getRun(id) {
  return db.prepare('SELECT * FROM runs WHERE id = ?').get(id);
}

function listRuns(limit = 50) {
  return db.prepare('SELECT id, type, prompt_version, created_at, ai_metadata, strapi_entry_id, published_at FROM runs ORDER BY id DESC LIMIT ?').all(limit);
}

/**
 * Every run that's been pushed to Strapi — checked on every poll, not just
 * until the first time it's seen published. Jobs/companies routinely get
 * unpublished, edited, and republished (e.g. a proofreading pass right after
 * the first push), and each of those cycles is a real signal worth
 * capturing — freezing "final" at the first publish would silently miss
 * every edit made after that.
 */
function listPushedRuns() {
  return db.prepare(`
    SELECT id, strapi_entry_id, strapi_document_id, strapi_content_type
    FROM runs
    WHERE strapi_entry_id IS NOT NULL
  `).all();
}

function addSource({ label, url, category }) {
  const info = db.prepare(`
    INSERT INTO sources (label, url, category, created_at)
    VALUES (@label, @url, @category, @createdAt)
  `).run({ label, url, category: category || null, createdAt: new Date().toISOString() });
  return info.lastInsertRowid;
}

function listSources() {
  return db.prepare('SELECT * FROM sources ORDER BY category IS NULL, category, label').all();
}

function deleteSource(id) {
  db.prepare('DELETE FROM sources WHERE id = ?').run(id);
}

function setSourceChecked(id, checked) {
  db.prepare('UPDATE sources SET checked_at = ? WHERE id = ?').run(checked ? new Date().toISOString() : null, id);
}

/** The "start a new round" button — clears every checkmark at once. */
function resetAllSourceChecks() {
  db.prepare('UPDATE sources SET checked_at = NULL').run();
}

function isLinkCheckRunning() {
  const check = db.prepare(`SELECT status FROM link_checks ORDER BY id DESC LIMIT 1`).get();
  return Boolean(check && check.status === 'running');
}

function startLinkCheck(total) {
  const info = db.prepare(`
    INSERT INTO link_checks (started_at, total, status) VALUES (?, ?, 'running')
  `).run(new Date().toISOString(), total);
  return info.lastInsertRowid;
}

function finishLinkCheck(checkId, error) {
  db.prepare(`UPDATE link_checks SET finished_at = ?, status = 'done', error = ? WHERE id = ?`)
    .run(new Date().toISOString(), error || null, checkId);
}

/** Set once the job list has actually been fetched — total starts at 0 so the UI shows "running" immediately. */
function setLinkCheckTotal(checkId, total) {
  db.prepare(`UPDATE link_checks SET total = ? WHERE id = ?`).run(total, checkId);
}

function addLinkCheckResult(checkId, { jobId, documentId, title, slug, applicationUrl, ok, statusCode, error }) {
  db.prepare(`
    INSERT INTO link_check_results (check_id, job_id, document_id, title, slug, application_url, ok, status_code, error, checked_at)
    VALUES (@checkId, @jobId, @documentId, @title, @slug, @applicationUrl, @ok, @statusCode, @error, @checkedAt)
  `).run({
    checkId,
    jobId,
    documentId: documentId || null,
    title: title || null,
    slug: slug || null,
    applicationUrl,
    ok: ok ? 1 : 0,
    statusCode: statusCode ?? null,
    error: error ?? null,
    checkedAt: new Date().toISOString(),
  });
}

function dismissJobLink(documentId, { jobId, applicationUrl, note } = {}) {
  db.transaction(() => {
    // Replace any not-yet-backfilled row for the same job rather than
    // leaving a duplicate behind.
    if (jobId) {
      db.prepare('DELETE FROM link_dismissals WHERE document_id IS NULL AND job_id = ?').run(jobId);
    }
    db.prepare(`
      INSERT INTO link_dismissals (document_id, job_id, application_url, dismissed_at, note)
      VALUES (@documentId, @jobId, @applicationUrl, @dismissedAt, @note)
      ON CONFLICT(document_id) DO UPDATE SET job_id = excluded.job_id, application_url = excluded.application_url,
        dismissed_at = excluded.dismissed_at, note = excluded.note
    `).run({ documentId, jobId: jobId || null, applicationUrl: applicationUrl || null, dismissedAt: new Date().toISOString(), note: note || null });
  })();
}

function undismissJobLink(documentId, { jobId } = {}) {
  db.prepare('DELETE FROM link_dismissals WHERE document_id = ? OR (document_id IS NULL AND job_id = ?)')
    .run(documentId, jobId || null);
}

/**
 * The most recent check, plus how many results are in so far (for a
 * progress bar while running). Each result is annotated with whether it's
 * been dismissed, so the UI can separate "needs attention" from "already
 * reviewed" without that state resetting on every new check run. A
 * dismissal only counts if the job's application_url hasn't changed since
 * it was dismissed — if an operator later edits the job to a new link,
 * that's an unreviewed link and should surface again, not stay silently
 * suppressed under the old link's dismissal.
 */
function getLatestLinkCheck() {
  const check = db.prepare(`SELECT * FROM link_checks ORDER BY id DESC LIMIT 1`).get();
  if (!check) return null;
  const results = db.prepare(`
    SELECT * FROM link_check_results WHERE check_id = ? ORDER BY ok ASC, id ASC
  `).all(check.id);
  // Matched by documentId; rows saved before documentId existed (and not yet
  // backfilled) still match on job_id so they don't vanish in the meantime.
  const allDismissals = db.prepare(`SELECT * FROM link_dismissals`).all();
  const byDocument = new Map(allDismissals.filter((d) => d.document_id).map((d) => [d.document_id, d]));
  const byLegacyJobId = new Map(allDismissals.filter((d) => !d.document_id).map((d) => [d.job_id, d]));
  const annotated = results.map((r) => {
    const dismissal = (r.document_id && byDocument.get(r.document_id)) || byLegacyJobId.get(r.job_id);
    const stillApplies = dismissal && (!dismissal.application_url || dismissal.application_url === r.application_url);
    return {
      ...r,
      dismissed_at: stillApplies ? dismissal.dismissed_at : null,
      note: stillApplies ? dismissal.note : null,
    };
  });
  return { ...check, results: annotated };
}

function isQualityCheckRunning() {
  const check = db.prepare(`SELECT status FROM quality_checks ORDER BY id DESC LIMIT 1`).get();
  return Boolean(check && check.status === 'running');
}

function startQualityCheck(total) {
  const info = db.prepare(`
    INSERT INTO quality_checks (started_at, total, status) VALUES (?, ?, 'running')
  `).run(new Date().toISOString(), total);
  return info.lastInsertRowid;
}

function setQualityCheckTotal(checkId, total) {
  db.prepare(`UPDATE quality_checks SET total = ? WHERE id = ?`).run(total, checkId);
}

function finishQualityCheck(checkId, error) {
  db.prepare(`UPDATE quality_checks SET finished_at = ?, status = 'done', error = ? WHERE id = ?`)
    .run(new Date().toISOString(), error || null, checkId);
}

function addQualityCheckResult(checkId, result) {
  db.prepare(`
    INSERT INTO quality_check_results (
      check_id, job_id, document_id, title, slug, job_updated_at,
      content_prompt_version, content_scores, content_issues, content_strengths, content_summary, content_error,
      lighthouse_scores, lighthouse_tips, lighthouse_error,
      checked_at
    ) VALUES (
      @checkId, @jobId, @documentId, @title, @slug, @jobUpdatedAt,
      @contentPromptVersion, @contentScores, @contentIssues, @contentStrengths, @contentSummary, @contentError,
      @lighthouseScores, @lighthouseTips, @lighthouseError,
      @checkedAt
    )
  `).run({
    checkId,
    jobId: result.jobId,
    documentId: result.documentId || null,
    title: result.title || null,
    slug: result.slug || null,
    jobUpdatedAt: result.jobUpdatedAt || null,
    contentPromptVersion: result.contentPromptVersion || null,
    contentScores: result.contentScores ? JSON.stringify(result.contentScores) : null,
    contentIssues: result.contentIssues ? JSON.stringify(result.contentIssues) : null,
    contentStrengths: result.contentStrengths ? JSON.stringify(result.contentStrengths) : null,
    contentSummary: result.contentSummary || null,
    contentError: result.contentError || null,
    lighthouseScores: result.lighthouseScores ? JSON.stringify(result.lighthouseScores) : null,
    lighthouseTips: result.lighthouseTips ? JSON.stringify(result.lighthouseTips) : null,
    lighthouseError: result.lighthouseError || null,
    checkedAt: new Date().toISOString(),
  });
}

/**
 * The most recent audit result for every job that's ever been audited,
 * regardless of which check run produced it — used to skip re-auditing a
 * job whose content hasn't changed since its last (error-free) audit. This
 * matters because a full audit costs real Claude usage (the mini's
 * subscription has a weekly limit that's been hit before) and real time
 * (Lighthouse audits a live page one at a time on shared hardware), so a
 * routine re-run over all published jobs should mostly be free.
 */
/** Per-job key for quality results: the Strapi documentId, which survives
 * re-publishing (the numeric job_id doesn't in Strapi 5). Rows saved before
 * document_id existed fall back to their job_id. */
function qualityResultKey(documentId, jobId) {
  return documentId || `job:${jobId}`;
}

function getLatestQualityResultPerJob() {
  const rows = db.prepare(`
    SELECT r1.*
    FROM quality_check_results r1
    INNER JOIN (
      SELECT COALESCE(document_id, 'job:' || job_id) AS job_key, MAX(id) AS max_id
      FROM quality_check_results
      GROUP BY job_key
    ) latest ON r1.id = latest.max_id
  `).all();
  return new Map(rows.map((r) => [qualityResultKey(r.document_id, r.job_id), parseResultRow(r)]));
}

function parseResultRow(r) {
  return {
    ...r,
    content_scores: r.content_scores ? JSON.parse(r.content_scores) : null,
    content_issues: r.content_issues ? JSON.parse(r.content_issues) : null,
    content_strengths: r.content_strengths ? JSON.parse(r.content_strengths) : null,
    lighthouse_scores: r.lighthouse_scores ? JSON.parse(r.lighthouse_scores) : null,
    lighthouse_tips: r.lighthouse_tips ? JSON.parse(r.lighthouse_tips) : null,
  };
}

/** Every job's latest result, across all check runs — a single on-demand
 * check and a 25-job batch both feed the same accumulating list, so
 * checking one job never shrinks what's shown for the rest. */
function listLatestQualityResults() {
  return Array.from(getLatestQualityResultPerJob().values());
}

/**
 * The most recent check (for status/progress while running), plus the full
 * accumulated latest-per-job results list (for display) — these are
 * different things on purpose: progressCount is scoped to just the
 * currently-running (or last) check_id so the progress bar makes sense,
 * while `results` is every job's latest result ever, so a small check
 * doesn't make previously-checked jobs disappear from the list.
 */
function getLatestQualityCheck() {
  const check = db.prepare(`SELECT * FROM quality_checks ORDER BY id DESC LIMIT 1`).get();
  if (!check) return null;
  const progressCount = db.prepare(`SELECT COUNT(*) AS n FROM quality_check_results WHERE check_id = ?`).get(check.id).n;
  return { ...check, progressCount, results: listLatestQualityResults() };
}

module.exports = {
  db,
  insertRun,
  markPushed,
  markPublished,
  getRun,
  listRuns,
  listPushedRuns,
  addSource,
  listSources,
  deleteSource,
  setSourceChecked,
  resetAllSourceChecks,
  isLinkCheckRunning,
  startLinkCheck,
  setLinkCheckTotal,
  finishLinkCheck,
  addLinkCheckResult,
  getLatestLinkCheck,
  dismissJobLink,
  undismissJobLink,
  isQualityCheckRunning,
  startQualityCheck,
  setQualityCheckTotal,
  finishQualityCheck,
  addQualityCheckResult,
  getLatestQualityResultPerJob,
  qualityResultKey,
  listLatestQualityResults,
  getLatestQualityCheck,
};
