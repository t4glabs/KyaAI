const fs = require('fs');
const path = require('path');
const { db } = require('./db');
const { runClaude } = require('./claude');
const { PROMPT_FILES, PROMPTS_DIR } = require('./promptLoader');

// `claude -p` rejects a single prompt built from everything as "too long"
// once the example count gets large (confirmed failing at 197) — cap to
// the most recent N, which is also a more relevant signal than old runs.
const MAX_EXAMPLES = 40;

/**
 * The next free version number for a type, from every file in prompts/
 * (active, proposed, or rolled back) — not just current + 1, so a
 * rolled-back vN never gets overwritten by a later proposal.
 */
function nextVersionNumber(type) {
  const pattern = new RegExp(`^${type}-prompt\\.v(\\d+)(\\.[a-z]+)?\\.md$`);
  const versions = fs.readdirSync(PROMPTS_DIR)
    .map((f) => f.match(pattern))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  return versions.length ? Math.max(...versions) + 1 : 2;
}

/**
 * Reads the accumulated before/after log for the currently active prompt
 * version of one content type and asks Claude (via the subscription CLI,
 * not a metered API) to find recurring edit patterns and draft a complete
 * replacement prompt file addressing them. Writes the proposal to
 * prompts/<type>-prompt.vN.proposed.md — never touches the active prompt.
 *
 * Returns null when there's no published before/after data yet, otherwise
 * { outFileName, outPath, currentVersion, totalCount, examplesUsed }.
 */
async function generateProposal(type, { log = console.log } = {}) {
  const currentFileName = PROMPT_FILES[type];
  const currentVersion = currentFileName.replace(/\.md$/, '');
  const currentPromptText = fs.readFileSync(path.join(PROMPTS_DIR, currentFileName), 'utf8');

  // Only compare runs produced by the CURRENTLY active prompt version — once
  // a revision ships, older runs are a different era and not a fair signal
  // for what's wrong with the prompt in use today.
  const totalCount = db.prepare(`
    SELECT COUNT(*) AS count FROM runs
    WHERE type = ? AND prompt_version = ? AND final_metadata IS NOT NULL
  `).get(type, currentVersion).count;

  const rows = db.prepare(`
    SELECT id, source_text, ai_metadata, ai_description, final_metadata, final_description
    FROM runs
    WHERE type = ? AND prompt_version = ? AND final_metadata IS NOT NULL
    ORDER BY id DESC
    LIMIT ?
  `).all(type, currentVersion, MAX_EXAMPLES);

  if (rows.length === 0) return null;

  const sampleNote = totalCount > rows.length
    ? ` — using the ${rows.length} most recent (of ${totalCount} total; capped to avoid a too-long prompt)`
    : '';
  log(`Found ${totalCount} ${type} run(s) with before/after data on ${currentVersion}${sampleNote}. Asking Claude to analyze...`);

  const examples = rows.map((r) => ({
    aiDraft: { metadata: JSON.parse(r.ai_metadata), description: r.ai_description },
    published: { metadata: JSON.parse(r.final_metadata), description: r.final_description },
  }));

  const analysisPrompt = `You are reviewing how well a prompt for an AI ${type}-formatting assistant is performing, using real production before/after data from aikyamjobs.org.

Below is the CURRENT prompt file in full — its instructions, categorization lists, output contract, and changelog:
---
${currentPromptText}
---

Below are ${examples.length} real examples. Each has "aiDraft" (what this prompt produced) and "published" (what a human operator actually published after reviewing and editing it). Where a field is identical between the two, the AI got it right. Differences are the signal — that's what this prompt should be revised to address.

${JSON.stringify(examples, null, 2)}

Do exactly two things, in this order, under these exact headers:

## Pattern Analysis
Plain-English, a few short paragraphs. Identify concrete, recurring patterns
in what changed across these examples (not generic advice) — e.g. specific
fields that get edited often, and the specific nature of the edit. If the
sample is small, say so plainly and be appropriately tentative about how
strong the signal is.

## Revised Prompt
A complete replacement for the prompt file shown above, addressing the
patterns you found. Keep the exact same structure: the
<!-- PROMPT_START --> / <!-- PROMPT_END --> markers, the json+markdown fence
output contract, the categorization lists — do not change the output
contract itself unless the evidence specifically calls for it. Leave
anything the evidence doesn't implicate unchanged. End with a "## Changelog
vs. ${currentVersion}" section listing exactly what changed and why, citing
the specific patterns from your analysis above.`;

  // A batch job, not a request a user is blocked on — analyzing ~40 examples
  // and drafting a full replacement prompt file in one shot is heavier than
  // the interactive compose path, so give it much more room than the
  // default 120s before giving up.
  const rawOutput = await runClaude(analysisPrompt, 10 * 60_000, { effort: 'high' });

  const outFileName = `${type}-prompt.v${nextVersionNumber(type)}.proposed.md`;
  const outPath = path.join(PROMPTS_DIR, outFileName);
  fs.writeFileSync(outPath, rawOutput);

  return { outFileName, outPath, currentVersion, totalCount, examplesUsed: rows.length };
}

module.exports = { generateProposal, nextVersionNumber, MAX_EXAMPLES };
