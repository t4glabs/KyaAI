const { getAllPublishedJobsWithApplicationUrl } = require('./strapi');
const {
  isLinkCheckRunning,
  startLinkCheck,
  setLinkCheckTotal,
  finishLinkCheck,
  addLinkCheckResult,
} = require('./db');

const TIMEOUT_MS = 10_000;
const CONCURRENCY = 5;
// Identifies itself honestly rather than spoofing a browser — this is a
// reachability check, not an attempt to evade bot-blocking. Accept/
// Accept-Language are included because at least one real platform
// (Google Forms) returned different results depending on their presence.
const REQUEST_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; AikyamJobsLinkChecker/1.0; +https://aikyamjobs.org)',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

/**
 * Checks whether a URL responds. GET only — HEAD was tried first originally
 * (cheaper, no body), but real recruitment platforms turned out to handle
 * it inconsistently: Zoho Recruit (zohorecruit.com and white-labeled
 * instances like jobs.civicdatalab.in) returns 400 for HEAD but 200 for
 * GET on the exact same URL; another common ATS returned 404 for HEAD but
 * 200 for GET. Neither is a 405/501 "HEAD not allowed" response, so a
 * narrow HEAD-then-GET-on-405 fallback missed both — GET is simply the
 * only reliable signal across these platforms, and the bandwidth cost of
 * always using it is a non-issue at this scale (occasional runs over a
 * few hundred jobs, not continuous high-volume checking).
 *
 * "ok: false" means "couldn't verify" — it doesn't prove the link is
 * actually dead, since some sites still block automated requests outright
 * even with GET and real-looking headers.
 */
async function checkOneUrl(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: REQUEST_HEADERS,
    });
    // Body isn't needed — drop it without reading, so the connection can
    // be released promptly instead of held open by an unread stream.
    response.body?.cancel().catch(() => {});
    if (response.status < 400) {
      return { ok: true, statusCode: response.status };
    }
    return { ok: false, statusCode: response.status };
  } catch (err) {
    return { ok: false, error: err.name === 'AbortError' ? 'Timed out' : err.message };
  } finally {
    clearTimeout(timer);
  }
}

/** Runs in the background — the route that triggers this responds immediately. */
async function runLinkCheck() {
  if (isLinkCheckRunning()) {
    throw new Error('A link check is already running');
  }

  // Created immediately (before we even know how many jobs there are) so the
  // UI shows "running" right away instead of looking stuck while the job
  // list itself is being fetched — and so a failure at that step still has
  // somewhere to record itself instead of vanishing into a rejected promise.
  const checkId = startLinkCheck(0);

  let jobs;
  try {
    jobs = await getAllPublishedJobsWithApplicationUrl();
  } catch (err) {
    finishLinkCheck(checkId, `Could not fetch the job list from Strapi: ${err.message}`);
    throw err;
  }
  setLinkCheckTotal(checkId, jobs.length);

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
