const startBtn = document.getElementById('startBtn');
const checkMeta = document.getElementById('checkMeta');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const summary = document.getElementById('summary');
const brokenList = document.getElementById('brokenList');

let pollTimer = null;

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatWhen(iso) {
  return iso ? new Date(iso).toLocaleString() : '';
}

function render(check) {
  if (!check) {
    checkMeta.textContent = 'No check has been run yet.';
    progressBar.style.display = 'none';
    summary.textContent = '';
    brokenList.innerHTML = '';
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

  const broken = check.results.filter((r) => !r.ok);
  const ok = check.results.filter((r) => r.ok);

  summary.textContent = check.results.length > 0
    ? `${check.results.length} of ${check.total} checked so far — ${broken.length} need a look, ${ok.length} responded fine.`
    : 'No results yet.';

  brokenList.innerHTML = broken.map((r) => `
    <div class="field-box needs-review">
      <div style="flex:1">
        <div>${escapeHtml(r.title || `Job #${r.job_id}`)}</div>
        <div class="hint">
          ${r.status_code ? `HTTP ${r.status_code}` : escapeHtml(r.error || 'Unreachable')}
          — <a href="${escapeHtml(r.application_url)}" target="_blank" rel="noopener noreferrer">Open link to test yourself</a>
        </div>
      </div>
      <a href="${r.adminUrl}" target="_blank" rel="noopener noreferrer">View in Strapi →</a>
    </div>
  `).join('');
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

loadLatest();
