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
  let gone = 0;
  let errors = 0;
  let untracked = 0;

  for (const run of pushed) {
    // Strapi 5 single-entry routes only accept the documentId. Runs pushed
    // before it was recorded (and not resolved by backfill-document-ids.js)
    // can't be looked up — skip them quietly instead of 404ing every poll.
    if (!run.strapi_document_id) {
      untracked += 1;
      continue;
    }
    try {
      const snapshot = await getEntrySnapshot(run.strapi_content_type, run.strapi_document_id);
      if (snapshot.publishedAt) {
        markPublished(run.id, { metadata: snapshot.metadata, description: snapshot.description });
        updated += 1;
      }
    } catch (err) {
      // A 404 means the entry was deleted from Strapi after being pushed —
      // an expected real-world state (someone removed the posting), not a
      // failure of this tool. Logging it as an "error" every poll forever
      // is just noise; genuine failures (network issues, 5xx) still count.
      if (err.status === 404) {
        gone += 1;
        console.log(`[poller] run ${run.id} (${run.strapi_content_type} ${run.strapi_document_id}): no longer exists in Strapi (deleted)`);
      } else {
        errors += 1;
        console.error(`[poller] run ${run.id} (${run.strapi_content_type} ${run.strapi_document_id}): ${err.message}`);
      }
    }
  }

  if (pushed.length > 0) {
    const untrackedNote = untracked > 0 ? `, ${untracked} skipped (no documentId recorded)` : '';
    console.log(`[poller] checked ${pushed.length - untracked} pushed run(s): ${updated} currently live (final snapshot refreshed), ${gone} gone (deleted in Strapi), ${errors} error(s)${untrackedNote}`);
  }
  return { checked: pushed.length - untracked, updated, gone, errors, untracked };
}

module.exports = { pollPublishedEntries };
