const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

/**
 * Snapshots the production log (data/composer.sqlite) into a dated file and
 * prunes old snapshots. Run daily by launchd (see MAC_MINI_SETUP.md), or by
 * hand with `npm run backup`.
 *
 * Uses SQLite's online backup API rather than a plain file copy, so the
 * snapshot is consistent even while the server is mid-write. Opens the
 * source read-only and never touches it otherwise.
 */
const DATA_DIR = process.env.COMPOSER_DATA_DIR || path.join(__dirname, '..', 'data');
const SOURCE = path.join(DATA_DIR, 'composer.sqlite');
const BACKUP_DIR = process.env.COMPOSER_BACKUP_DIR || path.join(os.homedir(), 'Backups', 'KyaAI');
const KEEP = Number(process.env.COMPOSER_BACKUP_KEEP) || 30;

async function main() {
  if (!fs.existsSync(SOURCE)) {
    throw new Error(`No database at ${SOURCE} — nothing to back up.`);
  }
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const stamp = new Date().toISOString().slice(0, 10);
  const dest = path.join(BACKUP_DIR, `composer-${stamp}.sqlite`);
  const tmp = `${dest}.partial`;

  const db = new Database(SOURCE, { readonly: true, fileMustExist: true });
  try {
    await db.backup(tmp);
  } finally {
    db.close();
  }

  // Sanity-check the snapshot before it replaces anything: a backup that
  // can't be opened or has no runs table is worse than no backup.
  const check = new Database(tmp, { readonly: true });
  const { count } = check.prepare('SELECT COUNT(*) AS count FROM runs').get();
  const integrity = check.pragma('integrity_check', { simple: true });
  check.close();
  if (integrity !== 'ok') {
    fs.unlinkSync(tmp);
    throw new Error(`Snapshot failed integrity_check: ${integrity}`);
  }
  fs.renameSync(tmp, dest);

  // Same-day reruns overwrite that day's file; older days are pruned to KEEP.
  const snapshots = fs.readdirSync(BACKUP_DIR)
    .filter((f) => /^composer-\d{4}-\d{2}-\d{2}\.sqlite$/.test(f))
    .sort();
  const stale = snapshots.slice(0, Math.max(0, snapshots.length - KEEP));
  for (const f of stale) fs.unlinkSync(path.join(BACKUP_DIR, f));

  console.log(`${new Date().toISOString()} backup ok: ${dest} (${count} runs, ${(fs.statSync(dest).size / 1e6).toFixed(1)} MB; kept ${snapshots.length - stale.length}, pruned ${stale.length})`);
}

main().catch((err) => {
  console.error(`${new Date().toISOString()} backup FAILED:`, err.message);
  process.exit(1);
});
