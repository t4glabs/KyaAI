const express = require('express');
const { addSource, listSources, deleteSource, setSourceChecked, resetAllSourceChecks } = require('../lib/db');
const { searchJobs, searchCompanies } = require('../lib/strapi');

const router = express.Router();

router.get('/sources', (req, res) => {
  res.json(listSources());
});

router.post('/sources', (req, res) => {
  const { label, url, category } = req.body || {};
  if (!label || !label.trim() || !url || !url.trim()) {
    return res.status(400).json({ error: 'label and url are required' });
  }
  const id = addSource({ label: label.trim(), url: url.trim(), category: category ? category.trim() : null });
  res.json({ id });
});

router.delete('/sources/:id', (req, res) => {
  deleteSource(req.params.id);
  res.json({ ok: true });
});

router.post('/sources/:id/check', (req, res) => {
  const { checked } = req.body || {};
  setSourceChecked(req.params.id, Boolean(checked));
  res.json({ ok: true });
});

router.post('/sources/reset', (req, res) => {
  resetAllSourceChecks();
  res.json({ ok: true });
});

// "Has this already been posted?" — searches our own Strapi data only.
router.get('/duplicate-check', async (req, res) => {
  const { type, title, company } = req.query;
  try {
    if (type === 'company') {
      const matches = await searchCompanies(company || title || '');
      return res.json({ matches });
    }
    const matches = await searchJobs({ title, companyName: company });
    res.json({ matches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
