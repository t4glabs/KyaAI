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

db.exec(`
  CREATE TABLE IF NOT EXISTS link_dismissals (
    job_id INTEGER PRIMARY KEY,   -- one dismissal per job, not per check run
    application_url TEXT,         -- the exact link that was dismissed — see getLatestLinkCheck
    dismissed_at TEXT NOT NULL,
    note TEXT                     -- freeform, e.g. "known bit.ly false positive, verified working"
  );
`);

// CREATE TABLE IF NOT EXISTS won't add columns to a table that already
// existed from an earlier version of this tool — add any missing ones.
const NEW_COLUMNS = {
  strapi_content_type: 'TEXT',
  pushed_at: 'TEXT',
  pushed_metadata: 'TEXT',
  pushed_description: 'TEXT',
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

function markPushed(runId, { strapiEntryId, contentType, metadata, description }) {
  db.prepare(`
    UPDATE runs
    SET strapi_entry_id = @strapiEntryId,
        strapi_content_type = @contentType,
        pushed_at = @pushedAt,
        pushed_metadata = @pushedMetadata,
        pushed_description = @pushedDescription
    WHERE id = @runId
  `).run({
    runId,
    strapiEntryId,
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
    SELECT id, strapi_entry_id, strapi_content_type
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

function addLinkCheckResult(checkId, { jobId, title, slug, applicationUrl, ok, statusCode, error }) {
  db.prepare(`
    INSERT INTO link_check_results (check_id, job_id, title, slug, application_url, ok, status_code, error, checked_at)
    VALUES (@checkId, @jobId, @title, @slug, @applicationUrl, @ok, @statusCode, @error, @checkedAt)
  `).run({
    checkId,
    jobId,
    title: title || null,
    slug: slug || null,
    applicationUrl,
    ok: ok ? 1 : 0,
    statusCode: statusCode ?? null,
    error: error ?? null,
    checkedAt: new Date().toISOString(),
  });
}

function dismissJobLink(jobId, applicationUrl, note) {
  db.prepare(`
    INSERT INTO link_dismissals (job_id, application_url, dismissed_at, note)
    VALUES (@jobId, @applicationUrl, @dismissedAt, @note)
    ON CONFLICT(job_id) DO UPDATE SET application_url = excluded.application_url, dismissed_at = excluded.dismissed_at, note = excluded.note
  `).run({ jobId, applicationUrl: applicationUrl || null, dismissedAt: new Date().toISOString(), note: note || null });
}

function undismissJobLink(jobId) {
  db.prepare(`DELETE FROM link_dismissals WHERE job_id = ?`).run(jobId);
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
  const dismissals = new Map(
    db.prepare(`SELECT * FROM link_dismissals`).all().map((d) => [d.job_id, d])
  );
  const annotated = results.map((r) => {
    const dismissal = dismissals.get(r.job_id);
    const stillApplies = dismissal && (!dismissal.application_url || dismissal.application_url === r.application_url);
    return {
      ...r,
      dismissed_at: stillApplies ? dismissal.dismissed_at : null,
      note: stillApplies ? dismissal.note : null,
    };
  });
  return { ...check, results: annotated };
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
};
