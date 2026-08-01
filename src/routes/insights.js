const express = require('express');
const { getInsights } = require('../lib/insights');

const router = express.Router();

router.get('/insights', (req, res) => {
  try {
    res.json({
      job: getInsights('job'),
      company: getInsights('company'),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
