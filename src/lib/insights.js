const fs = require('fs');
const path = require('path');
const { db } = require('./db');
const { PROMPT_FILES } = require('./promptLoader');

const PROMPTS_DIR = path.join(__dirname, '..', '..', 'prompts');

// Fields that exist in the AI's output but aren't real Strapi schema fields —
// don't count these in the "how often does this field get edited" stats.
const NON_SCHEMA_FIELDS = new Set(['reviewFlags', 'socialCard', 'linkedinPost']);

function valuesEqual(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * Compares ai_metadata vs final_metadata across every run of a type that has
 * a captured final snapshot. Purely local JSON comparison — no AI calls, so
 * this is safe to compute on every page load with zero added cost. Rows
 * whose ai_metadata has no real baseline (see suggest-revision.js/README on
 * recovered historical runs) are excluded from field stats but still count
 * toward description stats, since ai_description was still real for those.
 */
function computeFieldStats(type) {
  const rows = db.prepare(`
    SELECT ai_metadata, final_metadata, ai_description, final_description
    FROM runs
    WHERE type = ? AND final_metadata IS NOT NULL
  `).all(type);

  const fieldStats = {};
  let descriptionChanged = 0;
  let descriptionTotal = 0;
  let validBaselineRows = 0;

  for (const row of rows) {
    const aiMeta = JSON.parse(row.ai_metadata);
    const finalMeta = JSON.parse(row.final_metadata);

    if (row.ai_description && row.final_description) {
      descriptionTotal += 1;
      if (row.ai_description.trim() !== row.final_description.trim()) {
        descriptionChanged += 1;
      }
    }

    if (aiMeta._note) continue; // recovered row with no real metadata baseline

    validBaselineRows += 1;
    const keys = new Set([...Object.keys(aiMeta), ...Object.keys(finalMeta)]);
    for (const key of keys) {
      if (NON_SCHEMA_FIELDS.has(key)) continue;
      if (!fieldStats[key]) fieldStats[key] = { changed: 0, total: 0 };
      fieldStats[key].total += 1;
      if (!valuesEqual(aiMeta[key], finalMeta[key])) {
        fieldStats[key].changed += 1;
      }
    }
  }

  return {
    fieldStats,
    descriptionStats: { changed: descriptionChanged, total: descriptionTotal },
    validBaselineRows,
    capturedCount: rows.length,
  };
}

function getActivityCounts(type) {
  const totalRuns = db.prepare('SELECT COUNT(*) AS n FROM runs WHERE type = ?').get(type).n;
  const pushedCount = db.prepare('SELECT COUNT(*) AS n FROM runs WHERE type = ? AND strapi_entry_id IS NOT NULL').get(type).n;
  const publishedCount = db.prepare('SELECT COUNT(*) AS n FROM runs WHERE type = ? AND final_metadata IS NOT NULL').get(type).n;
  return { totalRuns, pushedCount, publishedCount };
}

/** Extracts the "## Changelog..." section (to end of file) from a prompt doc. */
function extractChangelog(fileContent) {
  const match = fileContent.match(/## Changelog[\s\S]*$/);
  return match ? match[0].trim() : null;
}

/** Extracts just the "## Pattern Analysis" section from a suggest-revision proposal. */
function extractPatternAnalysis(fileContent) {
  const match = fileContent.match(/## Pattern Analysis([\s\S]*?)(?=\n## Revised Prompt)/);
  return match ? match[1].trim() : null;
}

function getPromptInfo(type) {
  const currentFileName = PROMPT_FILES[type];
  const currentVersion = currentFileName.replace(/\.md$/, '');
  const currentContent = fs.readFileSync(path.join(PROMPTS_DIR, currentFileName), 'utf8');

  let pendingProposal = null;
  const candidateFiles = fs.readdirSync(PROMPTS_DIR)
    .filter((f) => f.startsWith(`${type}-prompt.`) && f.endsWith('.proposed.md'));

  if (candidateFiles.length > 0) {
    // If more than one proposal somehow exists, show the newest by filename version.
    const fileName = candidateFiles.sort().reverse()[0];
    const content = fs.readFileSync(path.join(PROMPTS_DIR, fileName), 'utf8');
    pendingProposal = {
      fileName,
      patternAnalysis: extractPatternAnalysis(content),
    };
  }

  return {
    currentVersion,
    changelog: extractChangelog(currentContent),
    pendingProposal,
  };
}

function getInsights(type) {
  return {
    activity: getActivityCounts(type),
    ...computeFieldStats(type),
    prompt: getPromptInfo(type),
  };
}

module.exports = { getInsights };
