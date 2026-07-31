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

module.exports = { db, insertRun, markPushed, markPublished, getRun, listRuns, listPushedRuns };
