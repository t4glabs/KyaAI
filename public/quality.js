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

function scoreSpan(label, score) {
  const display = score === null || score === undefined ? 'n/a' : score;
  return `<span class="${scoreClass(score)}">${escapeHtml(label)}: ${display}</span>`;
}

const DIMENSION_LABELS = {
  writingQuality: 'Writing quality',
  genderNeutralLanguage: 'Inclusive language',
  selfContained: 'Self-contained',
  completeness: 'Completeness',
};

function renderIssue(issue) {
  return `
    <div class="field-box">
      <div style="flex:1">
        <div class="hint">${escapeHtml(DIMENSION_LABELS[issue.dimension] || issue.dimension)}</div>
        <div>"${escapeHtml(issue.quote)}"</div>
        <div class="hint">${escapeHtml(issue.problem)}</div>
        <div class="hint"><strong>Suggestion:</strong> ${escapeHtml(issue.suggestion)}</div>
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

  const contentLine = content
    ? [
        scoreSpan('Overall', content.overall),
        scoreSpan('Writing', content.writingQuality),
        scoreSpan('Inclusive language', content.genderNeutralLanguage),
        scoreSpan('Self-contained', content.selfContained),
        scoreSpan('Completeness', content.completeness),
      ].join(' &nbsp;·&nbsp; ')
    : r.content_error
      ? `<span class="lookup-new">Content scoring failed: ${escapeHtml(r.content_error)}</span>`
      : '<span class="hint">No content score</span>';

  const lighthouseLine = lighthouse
    ? [
        scoreSpan('Performance', lighthouse.performance),
        scoreSpan('Accessibility', lighthouse.accessibility),
        scoreSpan('SEO', lighthouse.seo),
        scoreSpan('Best practices', lighthouse.bestPractices),
      ].join(' &nbsp;·&nbsp; ')
    : r.lighthouse_error
      ? `<span class="lookup-new">Lighthouse failed: ${escapeHtml(r.lighthouse_error)}</span>`
      : '<span class="hint">No Lighthouse result</span>';

  const issues = (r.content_issues || []).map(renderIssue).join('');
  const strengths = (r.content_strengths || []).length
    ? `<p class="hint"><strong>Already working well:</strong> ${(r.content_strengths || []).map(escapeHtml).join('; ')}</p>`
    : '';
  const tips = (r.lighthouse_tips || []).map(renderTip).join('');

  const detailsId = `details-${r.job_id}`;

  return `
    <div class="field-box needs-review">
      <div style="flex:1">
        <div>
          ${escapeHtml(r.title || `Job #${r.job_id}`)}
          — <a href="${r.adminUrl}" target="_blank" rel="noopener noreferrer">Strapi &rarr;</a>
          ${r.liveUrl ? `· <a href="${r.liveUrl}" target="_blank" rel="noopener noreferrer">View live &rarr;</a>` : ''}
        </div>
        <div class="hint">Content — ${contentLine}</div>
        <div class="hint">Lighthouse — ${lighthouseLine}</div>
        <button class="copy-btn" data-action="toggle" data-target="${detailsId}">Show details</button>
        <div id="${detailsId}" hidden>
          ${r.content_summary ? `<p>${escapeHtml(r.content_summary)}</p>` : ''}
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
    ? `${check.results.length} job(s) with a score so far (across every check ever run, latest per job).`
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
  const response = await fetch('/api/quality/latest');
  const check = await response.json();
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
  const response = await fetch('/api/quality/jobs');
  const jobs = await response.json();
  if (!response.ok) {
    jobPicker.innerHTML = '<option value="">Could not load jobs</option>';
    return;
  }
  jobPicker.innerHTML = jobs.length
    ? jobs.map((j) => `<option value="${j.id}">${escapeHtml(j.title)}</option>`).join('')
    : '<option value="">No published jobs found</option>';
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

resultsList.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action="toggle"]');
  if (!btn) return;
  const target = document.getElementById(btn.dataset.target);
  if (!target) return;
  target.hidden = !target.hidden;
  btn.textContent = target.hidden ? 'Show details' : 'Hide details';
});

loadLatest();
loadJobPicker();
