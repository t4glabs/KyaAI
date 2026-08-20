require('dotenv').config();
const path = require('path');
const express = require('express');
const formatRoutes = require('./routes/format');
const pushRoutes = require('./routes/push');
const insightsRoutes = require('./routes/insights');
const sourcesRoutes = require('./routes/sources');
const linkCheckRoutes = require('./routes/link-check');
const qualityRoutes = require('./routes/quality');
const { pollPublishedEntries } = require('./lib/poller');

const app = express();
const PORT = process.env.PORT || 4100;
const POLL_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes — plenty for a few pushes a week

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/api', formatRoutes);
app.use('/api', pushRoutes);
app.use('/api', insightsRoutes);
app.use('/api', sourcesRoutes);
app.use('/api', linkCheckRoutes);
app.use('/api', qualityRoutes);

app.listen(PORT, () => {
  console.log(`job-composer running at http://localhost:${PORT}`);

  if (process.env.STRAPI_API_TOKEN) {
    setInterval(() => {
      pollPublishedEntries().catch((err) => console.error('[poller] unexpected error:', err.message));
    }, POLL_INTERVAL_MS);
  } else {
    console.log('[poller] STRAPI_API_TOKEN not set — publish-poller disabled until it is');
  }
});
