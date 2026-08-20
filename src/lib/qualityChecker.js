const { getAllPublishedJobsForQualityAudit, publicJobUrl } = require('./strapi');
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

/**
 * Runs in the background — the route that triggers this responds
 * immediately. Fully sequential, one job at a time (content score, then
 * Lighthouse audit, then the next job) rather than a concurrent worker
 * pool: Lighthouse shares a single headless Chrome instance so it can't
 * safely run more than one audit at a time anyway, and content scoring
 * uses the mac mini's Claude subscription, which has a weekly usage limit
 * that's already been hit once — there's no upside to burning through it
 * faster, and the mini also runs several unrelated services that a heavy
 * concurrent batch could compete with.
 *
 * A job whose Strapi updatedAt hasn't changed since its last (error-free)
 * audit is skipped and its previous result is carried forward under the
 * new check_id, so a routine re-run over all published jobs mostly costs
 * nothing — only genuinely new or edited jobs get re-audited.
 */
async function runQualityCheck() {
  if (isQualityCheckRunning()) {
    throw new Error('A quality check is already running');
  }

  const checkId = startQualityCheck(0);

  let jobs;
  try {
    jobs = await getAllPublishedJobsForQualityAudit();
  } catch (err) {
    finishQualityCheck(checkId, `Could not fetch the job list from Strapi: ${err.message}`);
    throw err;
  }
  setQualityCheckTotal(checkId, jobs.length);

  const previousResults = getLatestQualityResultPerJob();

  try {
    for (const job of jobs) {
      const previous = previousResults.get(job.id);
      const unchanged =
        previous &&
        previous.job_updated_at === job.updatedAt &&
        !previous.content_error &&
        !previous.lighthouse_error;

      if (unchanged) {
        addQualityCheckResult(checkId, {
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
        });
        continue;
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

      addQualityCheckResult(checkId, {
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
      });
    }
  } finally {
    await closeChrome();
  }

  finishQualityCheck(checkId);
  return checkId;
}

module.exports = { runQualityCheck };
