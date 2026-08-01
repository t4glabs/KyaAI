const startBtn = document.getElementById('startBtn');
const checkMeta = document.getElementById('checkMeta');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const summary = document.getElementById('summary');
const brokenList = document.getElementById('brokenList');
const dismissedList = document.getElementById('dismissedList');

let pollTimer = null;

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatWhen(iso) {
  return iso ? new Date(iso).toLocaleString() : '';
}

function renderRow(r, { dismissed }) {
  const actionBtn = dismissed
    ? `<button class="copy-btn" data-action="undismiss" data-job-id="${r.job_id}">Un-dismiss</button>`
    : `<button class="copy-btn" data-action="dismiss" data-job-id="${r.job_id}" data-url="${escapeHtml(r.application_url)}">Dismiss</button>`;

  return `
    <div class="field-box${dismissed ? '' : ' needs-review'}">
      <div style="flex:1">
        <div>${escapeHtml(r.title || `Job #${r.job_id}`)}</div>
        <div class="hint">
          ${r.status_code ? `HTTP ${r.status_code}` : escapeHtml(r.error || 'Unreachable')}
          — <a href="${escapeHtml(r.application_url)}" target="_blank" rel="noopener noreferrer">Open link to test yourself</a>
          ${dismissed ? `— dismissed ${formatWhen(r.dismissed_at)}` : ''}
        </div>
      </div>
      <a href="${r.adminUrl}" target="_blank" rel="noopener noreferrer">View in Strapi →</a>
      ${actionBtn}
    </div>
  `;
}

function render(check) {
  if (!check) {
    checkMeta.textContent = 'No check has been run yet.';
    progressBar.style.display = 'none';
    summary.textContent = '';
    brokenList.innerHTML = '';
    dismissedList.innerHTML = '';
    return;
  }

  const isRunning = check.status === 'running';
  startBtn.disabled = isRunning;

  if (check.error) {
    checkMeta.innerHTML = `<span class="lookup-new">Failed: ${escapeHtml(check.error)}</span>`;
  } else {
    checkMeta.textContent = isRunning
      ? `Running — started ${formatWhen(check.started_at)}`
      : `Last checked ${formatWhen(check.finished_at)} (started ${formatWhen(check.started_at)})`;
  }

  // Not using the `hidden` attribute here: .field-bar-row sets display:flex
  // in CSS, which beats the browser's default [hidden]{display:none} rule
  // (author styles win over the UA stylesheet even at equal specificity).
  progressBar.style.display = isRunning ? 'flex' : 'none';
  if (isRunning) {
    const pct = check.total > 0 ? Math.round((check.results.length / check.total) * 100) : 0;
    progressFill.style.width = `${pct}%`;
    progressText.textContent = `${check.results.length} / ${check.total}`;
  }

  const broken = check.results.filter((r) => !r.ok && !r.dismissed_at);
  const dismissed = check.results.filter((r) => !r.ok && r.dismissed_at);
  const ok = check.results.filter((r) => r.ok);

  summary.textContent = check.results.length > 0
    ? `${check.results.length} of ${check.total} checked so far — ${broken.length} need a look, ${dismissed.length} dismissed, ${ok.length} responded fine.`
    : 'No results yet.';

  brokenList.innerHTML = broken.length > 0
    ? broken.map((r) => renderRow(r, { dismissed: false })).join('')
    : '<p class="hint">Nothing needs attention right now.</p>';

  dismissedList.innerHTML = dismissed.length > 0
    ? dismissed.map((r) => renderRow(r, { dismissed: true })).join('')
    : '<p class="hint">Nothing dismissed yet.</p>';
}

async function loadLatest() {
  const response = await fetch('/api/link-check/latest');
  const check = await response.json();
  render(check);

  if (check && check.status === 'running') {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(loadLatest, 2000);
  }
}

startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  const response = await fetch('/api/link-check/start', { method: 'POST' });
  if (!response.ok) {
    const data = await response.json();
    checkMeta.textContent = `Error: ${data.error}`;
    startBtn.disabled = false;
    return;
  }
  loadLatest();
});

async function handleActionClick(e) {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;

  const jobId = btn.dataset.jobId;
  if (btn.dataset.action === 'dismiss') {
    await fetch(`/api/link-check/${jobId}/dismiss`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicationUrl: btn.dataset.url }),
    });
  } else if (btn.dataset.action === 'undismiss') {
    await fetch(`/api/link-check/${jobId}/undismiss`, { method: 'POST' });
  }
  loadLatest();
}

brokenList.addEventListener('click', handleActionClick);
dismissedList.addEventListener('click', handleActionClick);

loadLatest();
