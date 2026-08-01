const { getAllPublishedJobsWithApplicationUrl } = require('./strapi');
const { isLinkCheckRunning, startLinkCheck, finishLinkCheck, addLinkCheckResult } = require('./db');

const TIMEOUT_MS = 10_000;
const CONCURRENCY = 5;
// Identifies itself honestly rather than spoofing a browser — this is a
// reachability check, not an attempt to evade bot-blocking.
const USER_AGENT = 'Mozilla/5.0 (compatible; AikyamJobsLinkChecker/1.0; +https://aikyamjobs.org)';

async function fetchWithTimeout(url, method) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      method,
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT },
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Checks whether a URL responds. HEAD first (cheaper); some servers reject
 * HEAD specifically (405/501) or block it outright, so falls back to GET
 * before concluding anything. "ok: false" means "couldn't verify" — it
 * doesn't prove the link is actually dead, since some sites block automated
 * requests entirely even when the page works fine in a real browser.
 */
async function checkOneUrl(url) {
  for (const method of ['HEAD', 'GET']) {
    try {
      const response = await fetchWithTimeout(url, method);
      if (response.status < 400) {
        return { ok: true, statusCode: response.status };
      }
      if (method === 'HEAD' && (response.status === 405 || response.status === 501)) {
        continue; // this server just doesn't support HEAD — try GET before giving up
      }
      return { ok: false, statusCode: response.status };
    } catch (err) {
      if (method === 'HEAD') continue;
      return { ok: false, error: err.name === 'AbortError' ? 'Timed out' : err.message };
    }
  }
  return { ok: false, error: 'Unreachable' };
}

/** Runs in the background — the route that triggers this responds immediately. */
async function runLinkCheck() {
  if (isLinkCheckRunning()) {
    throw new Error('A link check is already running');
  }

  const jobs = await getAllPublishedJobsWithApplicationUrl();
  const checkId = startLinkCheck(jobs.length);

  let index = 0;
  async function worker() {
    while (index < jobs.length) {
      const job = jobs[index];
      index += 1;
      const result = await checkOneUrl(job.applicationUrl);
      addLinkCheckResult(checkId, {
        jobId: job.id,
        title: job.title,
        slug: job.slug,
        applicationUrl: job.applicationUrl,
        ok: result.ok,
        statusCode: result.statusCode,
        error: result.error,
      });
    }
  }

  const workerCount = Math.min(CONCURRENCY, jobs.length) || 1;
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  finishLinkCheck(checkId);
  return checkId;
}

module.exports = { runLinkCheck };
