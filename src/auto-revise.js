require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { db } = require('./lib/db');
const { computeVersionScore } = require('./lib/insights');
const { generateProposal } = require('./lib/promptRevision');
const { loadSystemPromptFile, PROMPTS_DIR } = require('./lib/promptLoader');
const { formatWithClaude } = require('./lib/claude');

/**
 * Unattended version of the suggest-revision → review → approve loop, run
 * weekly by launchd (space.aikyam.prompt-autorevise). For each type, one at
 * a time:
 *
 *   1. Wait until the active prompt has earned enough evidence: live at
 *      least MIN_DAYS_LIVE days and MIN_PUBLISHED_RUNS published runs.
 *   2. Score it (share of fields/descriptions humans edited before
 *      publishing). If it's clearly worse than the previous version with
 *      enough data, roll back to that version instead of building on it.
 *   3. Otherwise generate a proposal (same step as suggest-revision.js),
 *      check its structure, and have it draft SMOKE_SAMPLES real recent
 *      inputs through the same parser the Compose button uses. Any failure
 *      rejects the proposal and leaves the active prompt alone.
 *   4. Apply it, commit + push, and restart the Composer so everyone gets it.
 *
 *   node src/auto-revise.js               # the real thing
 *   node src/auto-revise.js --check-only  # just print what it would decide (no Claude calls)
 *   node src/auto-revise.js --dry-run     # generate + validate, but apply nothing
 *   node src/auto-revise.js --force       # ignore the waiting thresholds (testing)
 */
const ROOT = path.join(__dirname, '..');
const LOADER_PATH = path.join(__dirname, 'lib', 'promptLoader.js');
const REJECTED_DIR = path.join(ROOT, 'logs', 'auto-revise-rejected');
const LOCK_PATH = path.join(process.env.COMPOSER_DATA_DIR || path.join(ROOT, 'data'), 'auto-revise.lock');
const COMPOSER_LABEL = 'space.aikyam.job-composer';
const COMPOSER_URL = `http://localhost:${process.env.PORT || 4100}`;

const MIN_PUBLISHED_RUNS = { job: 30, company: 15 };
const MIN_DAYS_LIVE = 7;
// How much worse (percentage points) a version may score than the one
// before it before it's rolled back — some noise between batches is normal.
const ROLLBACK_MARGIN = { fieldEditPct: 3, descriptionEditPct: 10 };
const SMOKE_SAMPLES = 3;
// A metadata key the active prompt outputs in at least this share of its
// recent drafts is treated as part of the output contract.
const REQUIRED_KEY_SHARE = 0.9;

const args = new Set(process.argv.slice(2));
const CHECK_ONLY = args.has('--check-only');
const DRY_RUN = args.has('--dry-run');
const FORCE = args.has('--force');

const log = (...parts) => console.log(new Date().toISOString(), ...parts);
const pct = (n) => (n === null ? 'n/a' : `${n.toFixed(1)}%`);
const fmtScore = (s) => `${s.promptVersion}: ${s.runs} published, fields edited ${pct(s.fieldEditPct)}, descriptions edited ${pct(s.descriptionEditPct)}`;

// ---------------------------------------------------------------------------
// PROMPT_FILES lives in promptLoader.js source — read/write it as text, since
// the require() cache wouldn't see changes made during this run.

function readPromptFiles() {
  const src = fs.readFileSync(LOADER_PATH, 'utf8');
  const out = {};
  for (const type of ['job', 'company']) {
    const m = src.match(new RegExp(`\\b${type}: '([^']+)'`));
    if (!m) throw new Error(`Could not find PROMPT_FILES.${type} in promptLoader.js`);
    out[type] = m[1];
  }
  return out;
}

function setPromptFile(type, fileName) {
  const src = fs.readFileSync(LOADER_PATH, 'utf8');
  const updated = src.replace(new RegExp(`(\\b${type}: ')[^']+(')`), `$1${fileName}$2`);
  if (updated === src) throw new Error(`PROMPT_FILES.${type} was not updated`);
  fs.writeFileSync(LOADER_PATH, updated);
}

function versionNumber(fileOrVersion) {
  const m = fileOrVersion.match(/\.v(\d+)/);
  return m ? Number(m[1]) : null;
}

/** Most recent older version (active or not) with enough published runs to compare against. */
function findBaseline(type, currentNumber) {
  const pattern = new RegExp(`^${type}-prompt\\.v(\\d+)\\.md$`);
  const older = fs.readdirSync(PROMPTS_DIR)
    .map((f) => f.match(pattern))
    .filter((m) => m && Number(m[1]) < currentNumber)
    .sort((a, b) => Number(b[1]) - Number(a[1]));
  for (const m of older) {
    const score = computeVersionScore(type, m[0].replace(/\.md$/, ''));
    if (score.runs >= MIN_PUBLISHED_RUNS[type]) return { fileName: m[0], score };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Validation of a generated proposal.

function validateStructure(type, proposalPath, currentFileName) {
  const raw = fs.readFileSync(proposalPath, 'utf8');
  const currentVersion = currentFileName.replace(/\.md$/, '');
  const errors = [];
  const count = (s) => raw.split(s).length - 1;

  if (count('<!-- PROMPT_START -->') !== 1 || count('<!-- PROMPT_END -->') !== 1) {
    errors.push('expected exactly one PROMPT_START and one PROMPT_END marker');
  } else if (raw.indexOf('<!-- PROMPT_START -->') > raw.indexOf('<!-- PROMPT_END -->')) {
    errors.push('PROMPT_END comes before PROMPT_START');
  }
  for (const header of ['## Pattern Analysis', '## Revised Prompt', `## Changelog vs. ${currentVersion}`]) {
    if (!raw.includes(header)) errors.push(`missing "${header}" section`);
  }
  // The changelog is the last thing written — if it's missing or comes
  // before the prompt body, the output was cut off or reordered.
  if (raw.lastIndexOf(`## Changelog vs. ${currentVersion}`) < raw.indexOf('<!-- PROMPT_END -->')) {
    errors.push('changelog does not follow the prompt body (output looks truncated)');
  }
  if (errors.length) return errors;

  const proposed = loadSystemPromptFile(path.basename(proposalPath));
  const current = loadSystemPromptFile(currentFileName);
  const ratio = proposed.length / current.length;
  if (ratio < 0.6 || ratio > 1.8) {
    errors.push(`prompt body is ${Math.round(ratio * 100)}% the length of the current one (allowed 60–180%)`);
  }
  for (const fence of ['```json', '```markdown']) {
    if (!proposed.includes(fence)) errors.push(`prompt body no longer describes the ${fence} output fence`);
  }
  return errors;
}

function requiredKeys(type, currentVersion) {
  const rows = db.prepare(`
    SELECT ai_metadata FROM runs WHERE type = ? AND prompt_version = ? ORDER BY id DESC LIMIT 20
  `).all(type, currentVersion);
  const drafts = rows.map((r) => JSON.parse(r.ai_metadata)).filter((m) => !m._note);
  const counts = {};
  for (const m of drafts) for (const k of Object.keys(m)) counts[k] = (counts[k] || 0) + 1;
  return Object.keys(counts).filter((k) => counts[k] >= drafts.length * REQUIRED_KEY_SHARE);
}

/** Drafts a few real recent inputs with the proposed prompt through the
 * same parser the Compose button uses. */
async function smokeTest(type, proposalFileName, currentVersion) {
  const systemPrompt = loadSystemPromptFile(proposalFileName);
  const keys = requiredKeys(type, currentVersion);
  const samples = db.prepare(`
    SELECT id, source_text FROM runs
    WHERE type = ? AND prompt_version = ? AND length(source_text) > 200
    ORDER BY id DESC LIMIT ?
  `).all(type, currentVersion, SMOKE_SAMPLES);

  const errors = [];
  for (const sample of samples) {
    try {
      const { metadata, description } = await formatWithClaude(systemPrompt, sample.source_text);
      const missing = keys.filter((k) => !(k in metadata));
      if (missing.length) errors.push(`run ${sample.id}: draft is missing ${missing.join(', ')}`);
      if (!description || description.length < 200) errors.push(`run ${sample.id}: description is empty or very short`);
      else log(`  smoke test on run ${sample.id}: ok (${Object.keys(metadata).length} fields, ${description.length}-char description)`);
    } catch (err) {
      errors.push(`run ${sample.id}: ${err.message.slice(0, 300)}`);
    }
  }
  if (samples.length === 0) errors.push('no recent inputs to test the proposal on');
  return errors;
}

// ---------------------------------------------------------------------------

async function reviseType(type) {
  const currentFileName = readPromptFiles()[type];
  const currentVersion = currentFileName.replace(/\.md$/, '');
  const score = computeVersionScore(type, currentVersion);
  const daysLive = score.firstRunAt ? (Date.now() - new Date(score.firstRunAt)) / 86_400_000 : 0;
  log(`[${type}] active ${fmtScore(score)}, live ${daysLive.toFixed(1)} days`);

  if (!FORCE && (score.runs < MIN_PUBLISHED_RUNS[type] || daysLive < MIN_DAYS_LIVE)) {
    log(`[${type}] waiting — needs ${MIN_PUBLISHED_RUNS[type]} published runs and ${MIN_DAYS_LIVE} days live before the next revision`);
    return { type, action: 'waiting' };
  }

  const baseline = findBaseline(type, versionNumber(currentVersion));
  if (baseline) {
    log(`[${type}] previous ${fmtScore(baseline.score)}`);
    const worseFields = score.fieldEditPct > baseline.score.fieldEditPct + ROLLBACK_MARGIN.fieldEditPct;
    const worseDescriptions = score.descriptionEditPct > baseline.score.descriptionEditPct + ROLLBACK_MARGIN.descriptionEditPct;
    if (worseFields || worseDescriptions) {
      const reason = `${currentVersion} needs more editing than ${baseline.fileName} (${worseFields ? 'fields' : 'descriptions'})`;
      log(`[${type}] ROLLBACK: ${reason}`);
      if (CHECK_ONLY || DRY_RUN) return { type, action: 'would-roll-back', reason };
      const rolledBackName = `${currentVersion}.rolledback.md`;
      execFileSync('git', ['mv', `prompts/${currentFileName}`, `prompts/${rolledBackName}`], { cwd: ROOT });
      setPromptFile(type, baseline.fileName);
      // `git mv` already staged the rename; only the new name and the
      // loader need adding (the old path no longer exists to add).
      return {
        type, action: 'rolled-back', reason, from: currentVersion, to: baseline.fileName,
        files: [`prompts/${rolledBackName}`, 'src/lib/promptLoader.js'],
      };
    }
  }

  if (CHECK_ONLY) {
    log(`[${type}] would generate and test a new version from ${currentVersion}`);
    return { type, action: 'would-revise' };
  }

  const proposal = await generateProposal(type, { log: (msg) => log(`[${type}] ${msg}`) });
  if (!proposal) return { type, action: 'waiting' };
  log(`[${type}] proposal written: ${proposal.outFileName}`);

  let errors = validateStructure(type, proposal.outPath, currentFileName);
  if (!errors.length) {
    log(`[${type}] structure ok — test-drafting ${SMOKE_SAMPLES} recent inputs with it`);
    errors = await smokeTest(type, proposal.outFileName, currentVersion);
  }

  if (errors.length || DRY_RUN) {
    fs.mkdirSync(REJECTED_DIR, { recursive: true });
    const kept = path.join(REJECTED_DIR, proposal.outFileName.replace('.proposed', DRY_RUN && !errors.length ? '.dryrun' : '.rejected'));
    fs.renameSync(proposal.outPath, kept);
    if (errors.length) {
      log(`[${type}] REJECTED, active prompt unchanged: ${errors.join(' | ')}`);
      log(`[${type}] proposal kept for inspection at ${path.relative(ROOT, kept)}`);
      return { type, action: 'rejected', errors };
    }
    log(`[${type}] dry run: proposal passed every check; kept at ${path.relative(ROOT, kept)}, nothing applied`);
    return { type, action: 'would-apply' };
  }

  const finalName = proposal.outFileName.replace('.proposed', '');
  fs.renameSync(proposal.outPath, path.join(PROMPTS_DIR, finalName));
  setPromptFile(type, finalName);
  log(`[${type}] APPLIED ${finalName}`);
  return { type, action: 'applied', from: currentVersion, to: finalName, files: [`prompts/${finalName}`, 'src/lib/promptLoader.js'] };
}

function git(...gitArgs) {
  return execFileSync('git', gitArgs, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }).trim();
}

/** Refuse to run if the files this script edits have uncommitted changes —
 * otherwise someone's in-progress manual edit would get swept into an
 * automatic commit. */
function preflight() {
  if (CHECK_ONLY || DRY_RUN) return;
  git('pull', '--ff-only');
  const dirty = git('status', '--porcelain', '--', 'prompts', 'src/lib/promptLoader.js');
  if (dirty) throw new Error(`prompts/ or promptLoader.js has uncommitted changes, not touching them:\n${dirty}`);
}

async function publish(changes) {
  const files = [...new Set(changes.flatMap((c) => c.files))];
  git('add', '--', ...files);
  const lines = changes.map((c) => (c.action === 'applied'
    ? `- ${c.type}: ${c.from} -> ${c.to.replace(/\.md$/, '')} (passed structure + smoke checks)`
    : `- ${c.type}: rolled back ${c.from} -> ${c.to.replace(/\.md$/, '')}: ${c.reason}`));
  const message = `Auto prompt revision: ${changes.map((c) => `${c.type} ${c.to.replace(/\.md$/, '').replace(/^.*prompt\./, '')}`).join(', ')}\n\n${lines.join('\n')}\n\nGenerated by src/auto-revise.js from published before/after data.`;
  git('commit', '-m', message);
  log(`committed ${git('rev-parse', '--short', 'HEAD')}`);
  try {
    git('push', 'origin', 'HEAD');
    log('pushed to GitHub');
  } catch (err) {
    log(`WARNING: push failed (change is live locally, will need a manual push): ${err.message.split('\n')[0]}`);
  }

  execFileSync('launchctl', ['kickstart', '-k', `gui/${process.getuid()}/${COMPOSER_LABEL}`]);
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await fetch(`${COMPOSER_URL}/api/insights`);
      if (res.ok) {
        const insights = await res.json();
        log(`Composer restarted — live prompts: job ${insights.job.prompt.currentVersion}, company ${insights.company.prompt.currentVersion}`);
        return;
      }
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  log('WARNING: Composer did not come back within 20s after restart — check logs/err.log');
}

function acquireLock() {
  try {
    const pid = Number(fs.readFileSync(LOCK_PATH, 'utf8'));
    process.kill(pid, 0); // throws if that process is gone
    throw new Error(`another auto-revise run is in progress (pid ${pid})`);
  } catch (err) {
    if (err.code !== 'ENOENT' && err.code !== 'ESRCH') throw err;
  }
  fs.writeFileSync(LOCK_PATH, String(process.pid));
}

async function main() {
  acquireLock();
  try {
    log(`auto-revise starting${CHECK_ONLY ? ' (check only)' : ''}${DRY_RUN ? ' (dry run)' : ''}${FORCE ? ' (forced)' : ''}`);
    preflight();

    const results = [];
    // One type at a time — never two Claude jobs in parallel.
    for (const type of ['job', 'company']) {
      try {
        results.push(await reviseType(type));
      } catch (err) {
        log(`[${type}] ERROR, active prompt unchanged: ${err.message}`);
        results.push({ type, action: 'error' });
      }
    }

    const changes = results.filter((r) => r.action === 'applied' || r.action === 'rolled-back');
    if (changes.length) await publish(changes);
    log(`auto-revise done: ${results.map((r) => `${r.type} ${r.action}`).join(', ')}`);
  } finally {
    fs.rmSync(LOCK_PATH, { force: true });
  }
}

if (require.main === module) {
  main().catch((err) => {
    log(`auto-revise FAILED: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { validateStructure, requiredKeys, readPromptFiles };
