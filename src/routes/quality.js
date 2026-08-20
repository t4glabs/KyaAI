const express = require('express');
const { runQualityCheckBatch, runQualityCheckOne, runQualityCheckByUrl, PICKER_LIMIT } = require('../lib/qualityChecker');
const { isQualityCheckRunning, getLatestQualityCheck } = require('../lib/db');
const { adminEditUrl, publicJobUrl, getRecentPublishedJobsForQualityAudit } = require('../lib/strapi');

const router = express.Router();

/** The latest 30 published jobs' id+title, for the "check one job" picker. */
router.get('/quality/jobs', async (req, res) => {
  try {
    const jobs = await getRecentPublishedJobsForQualityAudit(PICKER_LIMIT);
    res.json(jobs.map((j) => ({ id: j.id, title: j.title })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/quality/check-batch', (req, res) => {
  if (isQualityCheckRunning()) {
    return res.status(409).json({ error: 'A quality check is already running' });
  }
  // Fire-and-forget — auditing 25 jobs (content scoring + a real Lighthouse
  // run each) takes a while, so the route responds immediately and the
  // frontend polls /latest for progress.
  runQualityCheckBatch().catch((err) => console.error('[quality] batch failed:', err.message));
  res.json({ started: true });
});

router.post('/quality/check-one', async (req, res) => {
  const { jobId } = req.body || {};
  if (!jobId) {
    return res.status(400).json({ error: 'jobId is required' });
  }
  if (isQualityCheckRunning()) {
    return res.status(409).json({ error: 'A quality check is already running' });
  }
  try {
    await runQualityCheckOne(jobId);
    res.json({ done: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/quality/check-url', async (req, res) => {
  const { url } = req.body || {};
  if (!url) {
    return res.status(400).json({ error: 'url is required' });
  }
  if (isQualityCheckRunning()) {
    return res.status(409).json({ error: 'A quality check is already running' });
  }
  try {
    await runQualityCheckByUrl(url);
    res.json({ done: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/quality/latest', (req, res) => {
  const check = getLatestQualityCheck();
  if (!check) return res.json(null);
  check.results = check.results.map((r) => ({
    ...r,
    adminUrl: adminEditUrl('job', r.job_id),
    liveUrl: r.slug ? publicJobUrl(r.slug) : null,
  }));
  res.json(check);
});

module.exports = router;
