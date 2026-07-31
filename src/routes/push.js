const express = require('express');
const { createJobDraft, upsertCompanyDraft, adminEditUrl } = require('../lib/strapi');
const { markPushed, getRun } = require('../lib/db');

const router = express.Router();

router.post('/push', async (req, res) => {
  const { runId, type, metadata, description } = req.body || {};

  if (type !== 'job' && type !== 'company') {
    return res.status(400).json({ error: "type must be 'job' or 'company'" });
  }
  if (!runId || !getRun(runId)) {
    return res.status(400).json({ error: 'runId is missing or does not match a logged run' });
  }
  if (!description || !description.trim()) {
    return res.status(400).json({ error: 'description is empty' });
  }

  try {
    const entry = type === 'job'
      ? await createJobDraft(metadata, description)
      : await upsertCompanyDraft(metadata, description);

    markPushed(runId, {
      strapiEntryId: entry.id,
      contentType: type,
      metadata,
      description,
    });

    res.json({
      success: true,
      entryId: entry.id,
      adminUrl: adminEditUrl(type, entry.id),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
