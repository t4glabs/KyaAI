const { spawn } = require('child_process');

const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';
const TIMEOUT_MS = 120_000;

/**
 * Runs `claude -p` non-interactively with the given prompt piped in via stdin,
 * and returns the raw stdout text. Uses the subscription CLI, not the metered API.
 */
function runClaude(fullPrompt) {
  return new Promise((resolve, reject) => {
    const child = spawn(CLAUDE_BIN, ['-p', '--output-format', 'text'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`claude -p timed out after ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`claude -p exited with code ${code}: ${stderr.slice(0, 2000)}`));
        return;
      }
      resolve(stdout);
    });

    child.stdin.write(fullPrompt);
    child.stdin.end();
  });
}

/**
 * Extracts the first ```json ... ``` and ```markdown ... ``` fenced blocks
 * from Claude's response text.
 */
function extractFences(text) {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
  const markdownMatch = text.match(/```markdown\s*([\s\S]*?)```/);

  if (!jsonMatch) {
    throw new Error('No ```json fence found in Claude output');
  }
  if (!markdownMatch) {
    throw new Error('No ```markdown fence found in Claude output');
  }

  let metadata;
  try {
    metadata = JSON.parse(jsonMatch[1].trim());
  } catch (err) {
    throw new Error(`Could not parse JSON fence: ${err.message}`);
  }

  const description = markdownMatch[1].trim();

  return { metadata, description };
}

/**
 * Runs the full format pipeline: system prompt + source text -> parsed
 * { metadata, description } object.
 */
async function formatWithClaude(systemPrompt, sourceText) {
  const fullPrompt = `${systemPrompt}\n\n---\n\nHere is the source content to format:\n\n${sourceText}`;
  const rawOutput = await runClaude(fullPrompt);
  return { ...extractFences(rawOutput), rawOutput };
}

module.exports = { runClaude, extractFences, formatWithClaude };
