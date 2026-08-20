const {
  getRecentPublishedJobsForQualityAudit,
  publicJobUrl,
  slugFromJobUrl,
  getPublishedJobBySlug,
} = require('./strapi');
const { scoreJobContent } = require('./contentQuality');
const { auditUrl, closeChrome } = require('./lighthouseAudit');
const {
  isQualityCheckRunning,
  startQualityCheck,
  setQualityCheckTotal,
  finishQualityCheck,
  addQualityCheckResult,
  getLatestQualityResultPerJob,
} = require('./db');

const RECENT_LIMIT = 25;
// The "check one job" picker (and the id lookup behind it) intentionally
// shows a few more jobs than a batch check covers — browsing a slightly
// longer list to pick one on-demand job costs nothing, unlike auditing all
// of them in a batch, which spends real Claude/Lighthouse cost per job.
const PICKER_LIMIT = 30;

/**
 * Scores one job's content and audits its live page, unless it's unchanged
 * since its last error-free audit — in which case that previous result is
 * carried forward instead of spending Claude/Lighthouse cost again.
 */
async function auditOneJob(job, previous) {
  const unchanged =
    previous &&
    previous.job_updated_at === job.updatedAt &&
    !previous.content_error &&
    !previous.lighthouse_error;

  if (unchanged) {
    return {
      jobId: job.id,
      title: job.title,
      slug: job.slug,
      jobUpdatedAt: job.updatedAt,
      contentPromptVersion: previous.content_prompt_version,
      contentScores: previous.content_scores,
      contentIssues: previous.content_issues,
      contentStrengths: previous.content_strengths,
      contentSummary: previous.content_summary,
      lighthouseScores: previous.lighthouse_scores,
      lighthouseTips: previous.lighthouse_tips,
    };
  }

  let contentResult = null;
  let contentError = null;
  try {
    contentResult = await scoreJobContent({ title: job.title, description: job.description });
  } catch (err) {
    contentError = err.message;
  }

  let lighthouseResult = null;
  let lighthouseError = null;
  try {
    lighthouseResult = await auditUrl(publicJobUrl(job.slug));
  } catch (err) {
    lighthouseError = err.message;
  }

  return {
    jobId: job.id,
    title: job.title,
    slug: job.slug,
    jobUpdatedAt: job.updatedAt,
    contentPromptVersion: contentResult?.promptVersion,
    contentScores: contentResult?.scores,
    contentIssues: contentResult?.issues,
    contentStrengths: contentResult?.strengths,
    contentSummary: contentResult?.summary,
    contentError,
    lighthouseScores: lighthouseResult?.scores,
    lighthouseTips: lighthouseResult?.tips,
    lighthouseError,
  };
}

/**
 * Audits the most recently published `limit` jobs (25 by default) — not
 * every published job on the site. Most of the ~370 published jobs are old
 * or migrated-from-Ghost residue nobody's going back to edit, and auditing
 * all of them costs real Claude quota (the mac mini's subscription has a
 * weekly limit already hit once from ordinary day-to-day use) and real
 * Lighthouse time (one shared headless Chrome, sequential, on a machine
 * that also runs several unrelated services) for little practical benefit
 * — a fix only happens on a posting someone still cares about, which skews
 * recent. Runs in the background — the route that triggers this responds
 * immediately.
 */
async function runQualityCheckBatch(limit = RECENT_LIMIT) {
  if (isQualityCheckRunning()) {
    throw new Error('A quality check is already running');
  }

  const checkId = startQualityCheck(0);

  let jobs;
  try {
    jobs = await getRecentPublishedJobsForQualityAudit(limit);
  } catch (err) {
    finishQualityCheck(checkId, `Could not fetch the job list from Strapi: ${err.message}`);
    throw err;
  }
  setQualityCheckTotal(checkId, jobs.length);

  const previousResults = getLatestQualityResultPerJob();

  try {
    for (const job of jobs) {
      const result = await auditOneJob(job, previousResults.get(job.id));
      addQualityCheckResult(checkId, result);
    }
  } finally {
    await closeChrome();
  }

  finishQualityCheck(checkId);
  return checkId;
}

/**
 * On-demand audit of a single job, picked from the latest-PICKER_LIMIT list
 * the UI's dropdown shows — deliberately not "any job by id," since the
 * whole point of this tab is to stay out of the long tail of old postings.
 * Synchronous (like /api/format's "up to a minute" call) rather than the
 * background+poll pattern, since it's only ever one job.
 */
async function runQualityCheckOne(jobId) {
  if (isQualityCheckRunning()) {
    throw new Error('A quality check is already running');
  }

  const jobs = await getRecentPublishedJobsForQualityAudit(PICKER_LIMIT);
  const job = jobs.find((j) => j.id === Number(jobId));
  if (!job) {
    throw new Error(`That job is not among the latest ${PICKER_LIMIT} published jobs anymore — refresh the list and try again.`);
  }

  const checkId = startQualityCheck(1);
  const previous = getLatestQualityResultPerJob().get(job.id);

  try {
    const result = await auditOneJob(job, previous);
    addQualityCheckResult(checkId, result);
  } finally {
    await closeChrome();
  }

  finishQualityCheck(checkId);
}

/**
 * On-demand audit of a single job identified by its live aikyamjobs.org
 * URL, rather than picked from the recent-jobs dropdown — so a job that's
 * fallen out of the latest 30 (or someone just has the live URL open) can
 * still be checked directly, without being limited to the recent-N list
 * runQualityCheckOne uses.
 */
async function runQualityCheckByUrl(url) {
  if (isQualityCheckRunning()) {
    throw new Error('A quality check is already running');
  }

  const slug = slugFromJobUrl(url);
  if (!slug) {
    throw new Error("That doesn't look like a live aikyamjobs.org job URL — expected something like https://aikyamjobs.org/jobs/<slug>.");
  }

  const job = await getPublishedJobBySlug(slug);
  if (!job) {
    throw new Error('No published job found at that URL — it may have been unpublished, deleted, or the slug is wrong.');
  }
  if (!job.description || !job.description.trim()) {
    throw new Error('That job has no description to audit.');
  }

  const checkId = startQualityCheck(1);
  const previous = getLatestQualityResultPerJob().get(job.id);

  try {
    const result = await auditOneJob(job, previous);
    addQualityCheckResult(checkId, result);
  } finally {
    await closeChrome();
  }

  finishQualityCheck(checkId);
}

module.exports = { runQualityCheckBatch, runQualityCheckOne, runQualityCheckByUrl, RECENT_LIMIT, PICKER_LIMIT };
