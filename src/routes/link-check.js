const express = require('express');
const { runLinkCheck } = require('../lib/linkChecker');
const {
  isLinkCheckRunning,
  getLatestLinkCheck,
  dismissJobLink,
  undismissJobLink,
} = require('../lib/db');
const { adminEditUrl } = require('../lib/strapi');
const { classifyLink } = require('../lib/linkClassifier');

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
  check.results = check.results.map((r) => ({
    ...r,
    adminUrl: adminEditUrl('job', r.document_id),
    linkType: classifyLink(r.application_url),
  }));
  res.json(check);
});

// Keyed by the job's Strapi documentId — its numeric id changes on every
// re-publish in Strapi 5. jobId rides along only to replace a dismissal row
// saved before documentIds were recorded.
router.post('/link-check/:documentId/dismiss', (req, res) => {
  dismissJobLink(req.params.documentId, {
    jobId: Number(req.body?.jobId) || null,
    applicationUrl: req.body?.applicationUrl,
    note: req.body?.note,
  });
  res.json({ ok: true });
});

router.post('/link-check/:documentId/undismiss', (req, res) => {
  undismissJobLink(req.params.documentId, { jobId: Number(req.body?.jobId) || null });
  res.json({ ok: true });
});

module.exports = router;
