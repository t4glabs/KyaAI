const startBtn = document.getElementById('startBtn');
const checkMeta = document.getElementById('checkMeta');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const summary = document.getElementById('summary');
const resultsList = document.getElementById('resultsList');
const jobPicker = document.getElementById('jobPicker');
const checkOneBtn = document.getElementById('checkOneBtn');
const checkOneStatus = document.getElementById('checkOneStatus');

let pollTimer = null;

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// For values placed inside an HTML attribute (e.g. data-copy-text="...") —
// the browser HTML-decodes attribute values automatically on read via
// .dataset, so escaping quotes here keeps the attribute well-formed without
// any extra unescaping step in the click handler.
function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}

function formatWhen(iso) {
  return iso ? new Date(iso).toLocaleString() : '';
}

/** Lighthouse audit descriptions include Markdown links (e.g. "[Learn
 * more](https://...)") — these are static strings baked into the lighthouse
 * package itself, not user input, so linkifying the already-escaped text is
 * safe. Plain text elsewhere in this file is never passed through this. */
function linkifyMarkdown(escapedText) {
  return escapedText.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );
}

function scoreClass(score) {
  if (score === null || score === undefined) return 'hint';
  return score >= 80 ? 'lookup-ok' : 'lookup-new';
}

function scoreChip(label, score) {
  const display = score === null || score === undefined ? 'n/a' : score;
  return `<span class="score-chip ${scoreClass(score)}"><span>${escapeHtml(label)}</span><span class="score-chip-value">${display}</span></span>`;
}

const DIMENSION_LABELS = {
  writingQuality: 'Writing quality',
  genderNeutralLanguage: 'Inclusive language',
  selfContained: 'Self-contained',
  completeness: 'Completeness',
};

function renderIssue(issue) {
  // Older stored rows (before the "replacement" field existed) still carry
  // the field under its old name "suggestion" — fall back to it so results
  // from before this change keep rendering instead of showing blank text.
  const replacement = issue.replacement || issue.suggestion || '';
  return `
    <div class="issue-card">
      <span class="issue-dimension">${escapeHtml(DIMENSION_LABELS[issue.dimension] || issue.dimension)}</span>
      <div class="issue-quote">&ldquo;${escapeHtml(issue.quote)}&rdquo;</div>
      <div class="issue-problem">${escapeHtml(issue.problem)}</div>
      <div class="issue-replacement">
        <div class="issue-replacement-head">
          <span class="issue-replacement-label">Replace with</span>
          <button class="copy-btn issue-copy-btn" data-action="copy" data-copy-text="${escapeAttr(replacement)}">Copy</button>
        </div>
        <div class="issue-replacement-text">${escapeHtml(replacement)}</div>
      </div>
    </div>
  `;
}

function renderTip(tip) {
  return `
    <div class="field-box">
      <div style="flex:1">
        <div>${escapeHtml(tip.title)} <span class="hint">(score: ${tip.score})</span></div>
        <div class="hint">${linkifyMarkdown(escapeHtml(tip.description || ''))}</div>
      </div>
    </div>
  `;
}

function renderRow(r) {
  const content = r.content_scores;
  const lighthouse = r.lighthouse_scores;

  const contentChips = content
    ? [
        scoreChip('Overall', content.overall),
        scoreChip('Writing', content.writingQuality),
        scoreChip('Inclusive language', content.genderNeutralLanguage),
        scoreChip('Self-contained', content.selfContained),
        scoreChip('Completeness', content.completeness),
      ].join('')
    : r.content_error
      ? `<span class="lookup-new">Content scoring failed: ${escapeHtml(r.content_error)}</span>`
      : '<span class="hint">No content score</span>';

  const lighthouseChips = lighthouse
    ? [
        scoreChip('Performance', lighthouse.performance),
        scoreChip('Accessibility', lighthouse.accessibility),
        scoreChip('SEO', lighthouse.seo),
        scoreChip('Best practices', lighthouse.bestPractices),
      ].join('')
    : r.lighthouse_error
      ? `<span class="lookup-new">Lighthouse failed: ${escapeHtml(r.lighthouse_error)}</span>`
      : '<span class="hint">No Lighthouse result</span>';

  const issuesList = r.content_issues || [];
  const issues = issuesList.length
    ? `<div class="score-group-label">Issues to fix (${issuesList.length})</div>${issuesList.map(renderIssue).join('')}`
    : '';
  const strengthsList = r.content_strengths || [];
  const strengths = strengthsList.length
    ? `<div class="score-group-label">Already working well</div><ul class="strengths-list">${strengthsList.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>`
    : '';
  const tipsList = r.lighthouse_tips || [];
  const tips = tipsList.length
    ? `<div class="score-group-label">Lighthouse tips</div>${tipsList.map(renderTip).join('')}`
    : '';

  const overall = content ? content.overall : null;
  const detailsId = `details-${r.job_id}`;

  return `
    <div class="field-box needs-review">
      <div style="flex:1">
        <div>
          ${escapeHtml(r.title || `Job #${r.job_id}`)}
          <span class="job-score-badge ${scoreClass(overall)}">${overall === null || overall === undefined ? 'n/a' : overall}</span>
          — <a href="${r.adminUrl}" target="_blank" rel="noopener noreferrer">Strapi &rarr;</a>
          ${r.liveUrl ? `· <a href="${r.liveUrl}" target="_blank" rel="noopener noreferrer">View live &rarr;</a>` : ''}
        </div>
        <div class="score-group-label">Content</div>
        <div class="score-chip-row">${contentChips}</div>
        <div class="score-group-label">Lighthouse</div>
        <div class="score-chip-row">${lighthouseChips}</div>
        <button class="copy-btn" data-action="toggle" data-target="${detailsId}">Show details</button>
        <div id="${detailsId}" hidden>
          ${r.content_summary ? `<div class="job-summary">${escapeHtml(r.content_summary)}</div>` : ''}
          ${strengths}
          ${issues}
          ${tips}
        </div>
      </div>
    </div>
  `;
}

function render(check) {
  if (!check) {
    checkMeta.textContent = 'No audit has been run yet.';
    progressBar.style.display = 'none';
    summary.textContent = '';
    resultsList.innerHTML = '';
    return;
  }

  const isRunning = check.status === 'running';
  startBtn.disabled = isRunning;
  checkOneBtn.disabled = isRunning;

  if (check.error) {
    checkMeta.innerHTML = `<span class="lookup-new">Failed: ${escapeHtml(check.error)}</span>`;
  } else {
    checkMeta.textContent = isRunning
      ? `Running — started ${formatWhen(check.started_at)}`
      : `Last check finished ${formatWhen(check.finished_at)} (started ${formatWhen(check.started_at)})`;
  }

  progressBar.style.display = isRunning ? 'flex' : 'none';
  if (isRunning) {
    const pct = check.total > 0 ? Math.round((check.progressCount / check.total) * 100) : 0;
    progressFill.style.width = `${pct}%`;
    progressText.textContent = `${check.progressCount} / ${check.total}`;
  }

  summary.textContent = check.results.length > 0
    ? `${check.results.length} ${check.results.length === 1 ? 'job' : 'jobs'} with a score so far (across every check ever run, latest per job).`
    : 'No results yet.';

  const sorted = [...check.results].sort((a, b) => {
    const scoreA = a.content_scores ? a.content_scores.overall : -1;
    const scoreB = b.content_scores ? b.content_scores.overall : -1;
    return scoreA - scoreB;
  });

  resultsList.innerHTML = sorted.length > 0
    ? sorted.map(renderRow).join('')
    : '<p class="hint">Nothing audited yet.</p>';
}

async function loadLatest() {
  let check;
  try {
    const response = await fetch('/api/quality/latest');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    check = await response.json();
  } catch (err) {
    // A transient blip here (e.g. an auth redirect page instead of the real
    // response) shouldn't silently kill the poll loop while a batch check is
    // genuinely still running server-side — show it and keep retrying.
    checkMeta.innerHTML = `<span class="lookup-new">Could not reach the server: ${escapeHtml(err.message)} — retrying...</span>`;
    clearTimeout(pollTimer);
    pollTimer = setTimeout(loadLatest, 3000);
    return;
  }

  render(check);

  if (check && check.status === 'running') {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(loadLatest, 3000);
  }
}

startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  const response = await fetch('/api/quality/check-batch', { method: 'POST' });
  if (!response.ok) {
    const data = await response.json();
    checkMeta.textContent = `Error: ${data.error}`;
    startBtn.disabled = false;
    return;
  }
  loadLatest();
});

async function loadJobPicker() {
  try {
    const response = await fetch('/api/quality/jobs');
    if (!response.ok) {
      jobPicker.innerHTML = `<option value="">Could not load jobs (HTTP ${response.status})</option>`;
      return;
    }
    const jobs = await response.json();
    jobPicker.innerHTML = jobs.length
      ? jobs.map((j) => `<option value="${j.id}">${escapeHtml(j.title)}</option>`).join('')
      : '<option value="">No published jobs found</option>';
  } catch (err) {
    // Covers a non-JSON response too (e.g. an auth redirect page instead of
    // the real API response) — response.json() throwing here previously left
    // the dropdown stuck on "Loading jobs…" forever with no visible error.
    jobPicker.innerHTML = `<option value="">Could not load jobs: ${escapeHtml(err.message)}</option>`;
  }
}

checkOneBtn.addEventListener('click', async () => {
  const jobId = jobPicker.value;
  if (!jobId) return;

  checkOneBtn.disabled = true;
  startBtn.disabled = true;
  checkOneStatus.textContent = 'Checking... this usually takes under a minute.';

  try {
    const response = await fetch('/api/quality/check-one', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Check failed');
    }
    checkOneStatus.textContent = 'Done — see its updated score in the list below.';
  } catch (err) {
    checkOneStatus.textContent = `Error: ${err.message}`;
  } finally {
    checkOneBtn.disabled = false;
    startBtn.disabled = false;
    loadLatest();
  }
});

resultsList.addEventListener('click', async (e) => {
  const copyBtn = e.target.closest('button[data-action="copy"]');
  if (copyBtn) {
    const original = copyBtn.textContent;
    try {
      await navigator.clipboard.writeText(copyBtn.dataset.copyText || '');
      copyBtn.textContent = 'Copied';
    } catch {
      copyBtn.textContent = 'Copy failed';
    }
    setTimeout(() => { copyBtn.textContent = original; }, 1500);
    return;
  }

  const btn = e.target.closest('button[data-action="toggle"]');
  if (!btn) return;
  const target = document.getElementById(btn.dataset.target);
  if (!target) return;
  target.hidden = !target.hidden;
  btn.textContent = target.hidden ? 'Show details' : 'Hide details';
});

loadLatest();
loadJobPicker();
