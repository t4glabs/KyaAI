const chromeLauncher = require('chrome-launcher');

const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'];
const LIGHTHOUSE_TIMEOUT_MS = 60_000;

let chromeInstance = null;

/**
 * One shared headless Chrome instance, reused across every audit in a batch
 * rather than launched fresh per page — the mac mini this runs on also
 * hosts several other unrelated services (an Airflow scheduler, doccano,
 * etc.), so relaunching a full browser process per job would be needlessly
 * heavy on shared resources for what's meant to be an occasional, manual
 * batch run.
 */
async function getChrome() {
  if (!chromeInstance) {
    chromeInstance = await chromeLauncher.launch({
      chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
    });
  }
  return chromeInstance;
}

async function closeChrome() {
  if (chromeInstance) {
    await chromeInstance.kill();
    chromeInstance = null;
  }
}

/**
 * Runs a real Lighthouse audit against a live URL and extracts category
 * scores plus a list of tips. The tips are Lighthouse's own audit titles/
 * descriptions verbatim — never invented or paraphrased by us or by
 * Claude — for every audit that scored below 0.9, worst first.
 */
async function auditUrl(url) {
  // Lazy-required: lighthouse's ESM build doesn't like being required at
  // module load time in every process that touches this file (e.g. a
  // one-off script that never actually audits anything); requiring it only
  // when actually auditing avoids paying that cost unconditionally.
  // It's published as ESM, so CommonJS require() gives back the interop
  // wrapper object, not the function itself — the callable is `.default`.
  const lighthouse = require('lighthouse').default;
  const chrome = await getChrome();

  // lighthouse() has no built-in cancellation signal, so a hung page can't
  // be aborted mid-run — but racing it against a timeout at least stops one
  // slow/stuck page from wedging the whole batch. The lighthouse call may
  // keep running in the background after this rejects; that's an accepted
  // trade-off for an occasional manual batch job, not a continuous service.
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Lighthouse timed out after ${LIGHTHOUSE_TIMEOUT_MS}ms`)), LIGHTHOUSE_TIMEOUT_MS);
  });

  try {
    const runnerResult = await Promise.race([
      lighthouse(url, {
        logLevel: 'error',
        output: 'json',
        onlyCategories: CATEGORIES,
        port: chrome.port,
      }),
      timeout,
    ]);
    if (!runnerResult || !runnerResult.lhr) {
      throw new Error('Lighthouse returned no result');
    }
    const lhr = runnerResult.lhr;

    const scores = {};
    for (const category of CATEGORIES) {
      const key = category === 'best-practices' ? 'bestPractices' : category;
      const entry = lhr.categories[category];
      scores[key] = entry && typeof entry.score === 'number' ? Math.round(entry.score * 100) : null;
    }

    const tips = Object.values(lhr.audits)
      .filter((audit) => typeof audit.score === 'number' && audit.score < 0.9)
      .map((audit) => ({
        id: audit.id,
        title: audit.title,
        description: audit.description,
        score: audit.score,
      }))
      .sort((a, b) => a.score - b.score)
      .slice(0, 15);

    return { scores, tips };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { auditUrl, closeChrome };
