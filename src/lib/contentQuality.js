const fs = require('fs');
const path = require('path');
const { runClaude, extractJsonFence } = require('./claude');

const PROMPT_PATH = path.join(__dirname, '..', '..', 'prompts', 'job-quality-audit.v1.md');
const PROMPT_VERSION = 'job-quality-audit.v1';

const SCORE_DIMENSIONS = ['writingQuality', 'genderNeutralLanguage', 'selfContained', 'completeness'];

function clampScore(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(100, Math.round(num)));
}

/**
 * The one real safeguard against a hallucinated issue: every issue is
 * required (by the prompt) to carry an exact quote from the real
 * description, but a prompt instruction alone doesn't guarantee the model
 * followed it. This checks each quote against the actual source text and
 * drops any issue whose quote isn't a real, verbatim substring — code-level
 * grounding, not just an instruction Claude might ignore.
 */
function verifyIssuesAgainstSource(issues, sourceText) {
  const verified = [];
  let droppedUnverifiable = 0;

  for (const issue of Array.isArray(issues) ? issues : []) {
    const quote = typeof issue?.quote === 'string' ? issue.quote.trim() : '';
    if (quote && sourceText.includes(quote)) {
      verified.push({
        dimension: SCORE_DIMENSIONS.includes(issue.dimension) ? issue.dimension : 'writingQuality',
        quote,
        problem: String(issue.problem || '').trim(),
        replacement: String(issue.replacement || '').trim(),
      });
    } else {
      droppedUnverifiable += 1;
    }
  }

  return { verified, droppedUnverifiable };
}

/**
 * Scores one job posting's content quality via Claude, using the rubric in
 * job-quality-audit.v1.md. Returns scores (0-100 each + a code-computed
 * overall — never an LLM-asserted aggregate), verified issues (quote
 * checked against the real text), strengths, and a summary.
 */
async function scoreJobContent({ title, description }) {
  const rubric = fs.readFileSync(PROMPT_PATH, 'utf8');
  const fullPrompt = `${rubric}\n\n---\n\nHere is the job posting to audit:\n\nTitle: ${title}\n\nDescription:\n${description}`;

  const rawOutput = await runClaude(fullPrompt);
  const parsed = extractJsonFence(rawOutput);

  const scores = {};
  for (const dim of SCORE_DIMENSIONS) {
    scores[dim] = clampScore(parsed?.scores?.[dim]);
  }
  scores.overall = Math.round(SCORE_DIMENSIONS.reduce((sum, dim) => sum + scores[dim], 0) / SCORE_DIMENSIONS.length);

  const { verified: issues, droppedUnverifiable } = verifyIssuesAgainstSource(parsed?.issues, description);

  const strengths = Array.isArray(parsed?.strengths)
    ? parsed.strengths.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim())
    : [];

  return {
    promptVersion: PROMPT_VERSION,
    scores,
    issues,
    strengths,
    summary: String(parsed?.summary || '').trim(),
    droppedUnverifiable,
  };
}

module.exports = { scoreJobContent, PROMPT_VERSION };
