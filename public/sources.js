const sourcesList = document.getElementById('sourcesList');
const checklistProgress = document.getElementById('checklistProgress');
const resetBtn = document.getElementById('resetBtn');
const addSourceBtn = document.getElementById('addSourceBtn');
const newLabel = document.getElementById('newLabel');
const newUrl = document.getElementById('newUrl');
const newCategory = document.getElementById('newCategory');
const checkBtn = document.getElementById('checkBtn');
const checkTitle = document.getElementById('checkTitle');
const checkCompany = document.getElementById('checkCompany');
const checkResults = document.getElementById('checkResults');

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function loadSources() {
  const sources = await (await fetch('/api/sources')).json();

  sourcesList.innerHTML = '';
  let checkedCount = 0;

  if (sources.length === 0) {
    sourcesList.innerHTML = '<p class="hint">No sources added yet — add your LinkedIn search, DevNetJobsIndia, the Tally form inbox, or any career page you check regularly below.</p>';
  }

  let lastCategory = null;
  sources.forEach((s) => {
    if (s.category !== lastCategory) {
      const heading = document.createElement('div');
      heading.className = 'source-category';
      heading.textContent = s.category || 'Uncategorized';
      sourcesList.appendChild(heading);
      lastCategory = s.category;
    }

    const isChecked = Boolean(s.checked_at);
    if (isChecked) checkedCount += 1;

    const row = document.createElement('div');
    row.className = 'source-row' + (isChecked ? ' source-done' : '');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = isChecked;
    checkbox.addEventListener('change', async () => {
      await fetch(`/api/sources/${s.id}/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checked: checkbox.checked }),
      });
      loadSources();
    });

    const link = document.createElement('a');
    link.href = s.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = s.label;

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'copy-btn';
    deleteBtn.textContent = 'Remove';
    deleteBtn.addEventListener('click', async () => {
      if (!confirm(`Remove "${s.label}"?`)) return;
      await fetch(`/api/sources/${s.id}`, { method: 'DELETE' });
      loadSources();
    });

    row.appendChild(checkbox);
    row.appendChild(link);
    row.appendChild(deleteBtn);
    sourcesList.appendChild(row);
  });

  checklistProgress.textContent = sources.length > 0 ? `${checkedCount} of ${sources.length} checked` : '';
}

resetBtn.addEventListener('click', async () => {
  await fetch('/api/sources/reset', { method: 'POST' });
  loadSources();
});

addSourceBtn.addEventListener('click', async () => {
  if (!newLabel.value.trim() || !newUrl.value.trim()) return;
  await fetch('/api/sources', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label: newLabel.value, url: newUrl.value, category: newCategory.value }),
  });
  newLabel.value = '';
  newUrl.value = '';
  newCategory.value = '';
  loadSources();
});

checkBtn.addEventListener('click', async () => {
  const type = document.querySelector('input[name="checkType"]:checked').value;
  const params = new URLSearchParams({ type, title: checkTitle.value, company: checkCompany.value });
  checkResults.innerHTML = '<p class="hint">Checking...</p>';

  try {
    const response = await fetch(`/api/duplicate-check?${params.toString()}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Check failed');

    if (data.matches.length === 0) {
      checkResults.innerHTML = '<p class="lookup-ok">Nothing found — looks new.</p>';
      return;
    }

    const publicBase = type === 'job' ? 'https://aikyamjobs.org/jobs/' : 'https://aikyamjobs.org/companies/';
    checkResults.innerHTML = `<p class="lookup-new">Found ${data.matches.length} possible match(es):</p>` +
      data.matches.map((m) => `
        <div class="field-box">
          <span>${escapeHtml(m.title || m.name)}${m.companyName ? ` — ${escapeHtml(m.companyName)}` : ''}
            (${m.publishedAt ? 'published' : 'draft'})</span>
          <a href="${publicBase}${encodeURIComponent(m.slug)}" target="_blank" rel="noopener noreferrer">View →</a>
        </div>
      `).join('');
  } catch (err) {
    checkResults.innerHTML = `<p class="lookup-new">Error: ${escapeHtml(err.message)}</p>`;
  }
});

loadSources();
