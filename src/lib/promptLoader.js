const fs = require('fs');
const path = require('path');

const PROMPTS_DIR = path.join(__dirname, '..', '..', 'prompts');

const PROMPT_FILES = {
  job: 'job-prompt.v2.md',
  company: 'company-prompt.v2.md',
};

/**
 * Extracts the text between <!-- PROMPT_START --> and <!-- PROMPT_END -->
 * markers in a prompt doc. This avoids parsing nested markdown code fences.
 */
function loadSystemPrompt(type) {
  const fileName = PROMPT_FILES[type];
  if (!fileName) {
    throw new Error(`Unknown prompt type: ${type}`);
  }

  const filePath = path.join(PROMPTS_DIR, fileName);
  const raw = fs.readFileSync(filePath, 'utf8');

  const match = raw.match(/<!-- PROMPT_START -->([\s\S]*?)<!-- PROMPT_END -->/);
  if (!match) {
    throw new Error(`Could not find PROMPT_START/PROMPT_END markers in ${fileName}`);
  }

  return match[1].trim();
}

module.exports = { loadSystemPrompt, PROMPT_FILES };
