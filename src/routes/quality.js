const express = require('express');
const { runQualityCheck } = require('../lib/qualityChecker');
const { isQualityCheckRunning, getLatestQualityCheck } = require('../lib/db');
const { adminEditUrl, publicJobUrl } = require('../lib/strapi');

const router = express.Router();

router.post('/quality/start', (req, res) => {
  if (isQualityCheckRunning()) {
    return res.status(409).json({ error: 'A quality check is already running' });
  }
  // Fire-and-forget — this audits every published job (content scoring +
  // a real Lighthouse run each), which can take a long time, so the route
  // responds immediately and the frontend polls /latest for progress.
  runQualityCheck().catch((err) => console.error('[quality] failed:', err.message));
  res.json({ started: true });
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
