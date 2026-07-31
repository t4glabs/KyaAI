const { listPushedRuns, markPublished } = require('./db');
const { getEntrySnapshot } = require('./strapi');

/**
 * Checks every run that's ever been pushed to Strapi. If it's currently
 * live (publishedAt is set), captures the current field values as the
 * "final" snapshot, overwriting whatever was captured last time — this
 * intentionally re-checks runs that were already seen published once,
 * because jobs/companies routinely get unpublished, edited, and republished
 * (a proofread pass right after the first push, for example), and each of
 * those cycles matters for the before/after log. If it's currently
 * unpublished (mid-edit), the last known "final" snapshot is left alone —
 * an in-progress edit isn't a real decision yet.
 */
async function pollPublishedEntries() {
  const pushed = listPushedRuns();
  let updated = 0;
  let errors = 0;

  for (const run of pushed) {
    try {
      const snapshot = await getEntrySnapshot(run.strapi_content_type, run.strapi_entry_id);
      if (snapshot.publishedAt) {
        markPublished(run.id, { metadata: snapshot.metadata, description: snapshot.description });
        updated += 1;
      }
    } catch (err) {
      errors += 1;
      console.error(`[poller] run ${run.id} (${run.strapi_content_type} #${run.strapi_entry_id}): ${err.message}`);
    }
  }

  if (pushed.length > 0) {
    console.log(`[poller] checked ${pushed.length} pushed run(s): ${updated} currently live (final snapshot refreshed), ${errors} error(s)`);
  }
  return { checked: pushed.length, updated, errors };
}

module.exports = { pollPublishedEntries };
