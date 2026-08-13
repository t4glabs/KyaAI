const express = require('express');
const { loadSystemPrompt, PROMPT_FILES } = require('../lib/promptLoader');
const { formatWithClaude } = require('../lib/claude');
const { resolveSourceText } = require('../lib/fetchSource');
const { checkCategories, checkCompany, findSimilarCompanies } = require('../lib/strapi');
const { insertRun, getRun, listRuns } = require('../lib/db');

const router = express.Router();

router.post('/format', async (req, res) => {
  const { type, input } = req.body || {};

  if (!PROMPT_FILES[type]) {
    return res.status(400).json({ error: `type must be one of: ${Object.keys(PROMPT_FILES).join(', ')}` });
  }
  if (!input || !input.trim()) {
    return res.status(400).json({ error: 'input is required' });
  }

  try {
    const sourceText = await resolveSourceText(input);
    const systemPrompt = loadSystemPrompt(type);
    const { metadata, description } = await formatWithClaude(systemPrompt, sourceText);

    // Read-only lookups against Strapi — informational only, nothing is created here.
    let categoryChecks = [];
    let companyCheck = null;
    try {
      if (type === 'job') {
        if (Array.isArray(metadata.categories)) {
          categoryChecks = await checkCategories(metadata.categories);
        }
        if (metadata.companyName) {
          companyCheck = await checkCompany(metadata.companyName);
          // Exact match failed — the name is very likely just formatted
          // differently ("CRY" vs "Child Rights and You - CRY", a missing
          // "The"/"Ltd", etc.), not actually new. Suggest close existing
          // matches instead of prompting straight to "create a new company."
          if (!companyCheck.exists) {
            companyCheck.suggestions = await findSimilarCompanies(metadata.companyName);
          }
        }
      }
    } catch (lookupErr) {
      // Don't fail the whole request if Strapi lookups fail (e.g. token not set yet) —
      // formatting is still useful on its own.
      categoryChecks = [];
      companyCheck = { error: lookupErr.message };
    }

    const runId = insertRun({
      type,
      promptVersion: PROMPT_FILES[type].replace(/\.md$/, ''),
      sourceText,
      metadata,
      description,
    });

    res.json({ runId, metadata, description, categoryChecks, companyCheck });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/runs', (req, res) => {
  res.json(listRuns());
});

router.get('/runs/:id', (req, res) => {
  const run = getRun(req.params.id);
  if (!run) return res.status(404).json({ error: 'not found' });
  res.json(run);
});

module.exports = router;
