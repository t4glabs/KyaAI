const express = require('express');
const { runLinkCheck } = require('../lib/linkChecker');
const { isLinkCheckRunning, getLatestLinkCheck } = require('../lib/db');
const { adminEditUrl } = require('../lib/strapi');

const router = express.Router();

router.post('/link-check/start', (req, res) => {
  if (isLinkCheckRunning()) {
    return res.status(409).json({ error: 'A link check is already running' });
  }
  // Fire-and-forget — this can take a while for hundreds of jobs, so the
  // route responds immediately and the frontend polls /latest for progress.
  runLinkCheck().catch((err) => console.error('[link-check] failed:', err.message));
  res.json({ started: true });
});

router.get('/link-check/latest', (req, res) => {
  const check = getLatestLinkCheck();
  if (!check) return res.json(null);
  check.results = check.results.map((r) => ({ ...r, adminUrl: adminEditUrl('job', r.job_id) }));
  res.json(check);
});

module.exports = router;
