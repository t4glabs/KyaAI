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
// sec-fetch-dest/sec-fetch-mode matter specifically for Google Forms: without
// them Google returns a blunt 401 that looks identical whether the form is
// actually gone or just requires sign-in; with them present Google instead
// redirects sign-in-gated forms to accounts.google.com, which lets
// checkOneUrl tell the two cases apart (see below).
const REQUEST_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; AikyamJobsLinkChecker/1.0; +https://aikyamjobs.org)',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
};

const GOOGLE_SIGNIN_REQUIRED_MESSAGE =
  'Redirects to Google sign-in — this form requires a Google account to view, ' +
  'for every visitor, not just this checker (often caused by the form\'s ' +
  '"Limit to 1 response" setting). Real applicants without a Google account ' +
  'may be blocked too — worth confirming with the organization rather than ' +
  'treating this as a dead link.';

/**
 * "Soft 404" phrases — pages that respond with a normal 2xx status but the
 * body itself says the posting is gone. Confirmed directly against Keka
 * (thenudge.keka.com returned HTTP 200 with "The Job posting is not
 * available anymore" for a job an operator had already found dead by hand
 * and unpublished — status-code-only checking missed it entirely). The
 * others are the same pattern on other common ATS platforms, added
 * proactively since Keka wasn't a one-off; each is specific enough wording
 * that it shouldn't false-positive on a real, live posting.
 */
const SOFT_404_PATTERNS = [
  /job posting is not available anymore/i,
  /may be deleted or hidden/i,
  /this job is no longer accepting applications/i,
  /this position has been filled/i,
  /job you('| a)re looking for is no longer available/i,
  /this job (posting |listing )?(is no longer|has expired)/i,
  /career opportunity .* (has expired|is no longer available)/i,
];

function findSoft404Match(bodyText) {
  for (const pattern of SOFT_404_PATTERNS) {
    const match = bodyText.match(pattern);
    if (match) return match[0];
  }
  return null;
}

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

    let finalHost = null;
    try {
      finalHost = new URL(response.url).hostname;
    } catch {
      // response.url should always be a valid absolute URL; ignore if not.
    }
    if (finalHost === 'accounts.google.com') {
      response.body?.cancel().catch(() => {});
      return { ok: false, statusCode: response.status, error: GOOGLE_SIGNIN_REQUIRED_MESSAGE };
    }

    // A 2xx/3xx status doesn't guarantee the posting is actually there —
    // some ATS platforms (confirmed on Keka) return HTTP 200 for a job page
    // whose content plainly says the posting was deleted. Read the body to
    // catch that "soft 404" case; job posting pages are small (a few KB),
    // so reading it in full here is cheap.
    const bodyText = await response.text().catch(() => '');
    if (response.status < 400) {
      const softMatch = findSoft404Match(bodyText);
      if (softMatch) {
        return {
          ok: false,
          statusCode: response.status,
          error: `Page loads (HTTP ${response.status}) but says the posting is gone: "${softMatch}" — this is the page's own wording, not a guess.`,
        };
      }
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
