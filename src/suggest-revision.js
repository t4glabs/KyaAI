require('dotenv').config();
const { generateProposal } = require('./lib/promptRevision');

/**
 * Phase 3, manual: reads the accumulated before/after log for one content
 * type and asks Claude to find recurring edit patterns and draft a complete
 * replacement prompt file addressing them. Writes the proposal to a new
 * file for review — never overwrites the active prompt itself. Jinso reads
 * the analysis, decides, and either approves (rename the file, bump
 * PROMPT_FILES) or asks for another pass. He never has to draft the revised
 * wording himself.
 *
 * The same proposal step also runs unattended, weekly, inside
 * auto-revise.js, which validates and applies it on its own.
 */
async function main() {
  const type = process.argv[2];
  if (type !== 'job' && type !== 'company') {
    console.error('Usage: npm run suggest-revision -- <job|company>');
    process.exit(1);
  }

  const result = await generateProposal(type);

  if (!result) {
    console.log(`No published ${type} runs on the active prompt version with a captured final snapshot yet.`);
    console.log('This needs real day-to-day usage first: push something, let it get published, and the poller will capture it.');
    console.log('Nothing to analyze until there\'s real before/after data to learn from.');
    return;
  }

  console.log(`\nProposal written to prompts/${result.outFileName}`);
  console.log('This does NOT change what the tool actually uses — review it first.');
  console.log(`To approve: rename it to remove ".proposed", then update PROMPT_FILES.${type} in src/lib/promptLoader.js to point to the new filename.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
