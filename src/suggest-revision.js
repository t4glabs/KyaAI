require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { db } = require('./lib/db');
const { runClaude } = require('./lib/claude');
const { PROMPT_FILES } = require('./lib/promptLoader');

const PROMPTS_DIR = path.join(__dirname, '..', 'prompts');

/**
 * Phase 3: reads the accumulated before/after log for one content type and
 * asks Claude (via the subscription CLI, not a metered API — this is meant
 * to run occasionally, e.g. quarterly, not automatically) to find recurring
 * edit patterns and draft a complete replacement prompt file addressing
 * them. Writes the proposal to a new file for review — never overwrites
 * the active prompt itself. Jinso reads the analysis, decides, and either
 * approves (rename the file, bump PROMPT_FILES) or asks for another pass.
 * He never has to draft the revised wording himself.
 */
async function main() {
  const type = process.argv[2];
  if (type !== 'job' && type !== 'company') {
    console.error('Usage: npm run suggest-revision -- <job|company>');
    process.exit(1);
  }

  const currentFileName = PROMPT_FILES[type];
  const currentVersion = currentFileName.replace(/\.md$/, '');
  const currentPromptText = fs.readFileSync(path.join(PROMPTS_DIR, currentFileName), 'utf8');

  // Only compare runs produced by the CURRENTLY active prompt version — once
  // a revision ships, older runs are a different era and not a fair signal
  // for what's wrong with the prompt in use today.
  const rows = db.prepare(`
    SELECT id, source_text, ai_metadata, ai_description, final_metadata, final_description
    FROM runs
    WHERE type = ? AND prompt_version = ? AND final_metadata IS NOT NULL
    ORDER BY id DESC
  `).all(type, currentVersion);

  if (rows.length === 0) {
    console.log(`No published ${type} runs on prompt version "${currentVersion}" with a captured final snapshot yet.`);
    console.log('This needs real day-to-day usage first: push something, let it get published, and the poller will capture it.');
    console.log('Nothing to analyze until there\'s real before/after data to learn from.');
    return;
  }

  console.log(`Found ${rows.length} ${type} run(s) with before/after data on ${currentVersion}. Asking Claude to analyze...`);

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

  // This is an occasional/manual batch job, not a request a user is blocked
  // on — analyzing ~30 examples and drafting a full replacement prompt file
  // in one shot is heavier than the interactive compose path, so give it
  // much more room than the default 120s before giving up.
  const rawOutput = await runClaude(analysisPrompt, 10 * 60_000);

  const versionMatch = currentVersion.match(/v(\d+)$/);
  const nextVersionNumber = versionMatch ? Number(versionMatch[1]) + 1 : 2;
  const outFileName = `${type}-prompt.v${nextVersionNumber}.proposed.md`;
  const outPath = path.join(PROMPTS_DIR, outFileName);

  fs.writeFileSync(outPath, rawOutput);

  console.log(`\nProposal written to prompts/${outFileName}`);
  console.log('This does NOT change what the tool actually uses — review it first.');
  console.log(`To approve: rename it to remove ".proposed", then update PROMPT_FILES.${type} in src/lib/promptLoader.js to point to the new filename.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
