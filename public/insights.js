const activityCards = document.getElementById('activityCards');
const fieldStatsEl = document.getElementById('fieldStats');
const descriptionStatEl = document.getElementById('descriptionStat');
const currentVersionEl = document.getElementById('currentVersion');
const changelogEl = document.getElementById('changelog');
const proposalSection = document.getElementById('proposalSection');
const proposalFileNameEl = document.getElementById('proposalFileName');
const proposalAnalysisEl = document.getElementById('proposalAnalysis');

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inlineFormat(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

/** Small, purpose-built renderer for the specific shape of our prompt docs
 *  (headers, bullet lists, bold/code inline) — not a general markdown parser.
 *  Groups line-by-line rather than by blank lines, since our changelogs put
 *  bullets directly under a heading with no blank line in between. */
function renderMarkdownish(text) {
  if (!text) return '';
  const lines = text.split('\n');
  let html = '';
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i += 1;
    } else if (line.startsWith('#')) {
      html += `<h4>${inlineFormat(line.replace(/^#+\s*/, ''))}</h4>`;
      i += 1;
    } else if (line.startsWith('- ')) {
      const items = [];
      while (i < lines.length && lines[i].trim().startsWith('- ')) {
        items.push(lines[i].trim().slice(2));
        i += 1;
      }
      html += `<ul>${items.map((it) => `<li>${inlineFormat(it)}</li>`).join('')}</ul>`;
    } else {
      const paraLines = [];
      while (i < lines.length && lines[i].trim() && !lines[i].trim().startsWith('#') && !lines[i].trim().startsWith('- ')) {
        paraLines.push(lines[i].trim());
        i += 1;
      }
      html += `<p>${inlineFormat(paraLines.join(' '))}</p>`;
    }
  }

  return html;
}

function renderStatCard(label, value) {
  const div = document.createElement('div');
  div.className = 'stat-card';
  div.innerHTML = `<div class="stat-value">${value}</div><div class="stat-label">${label}</div>`;
  return div;
}

function renderFieldBar(field, changed, total) {
  const pct = total > 0 ? Math.round((changed / total) * 100) : 0;
  const wrapper = document.createElement('div');
  wrapper.className = 'field-bar-row';
  wrapper.innerHTML = `
    <div class="field-bar-label">${escapeHtml(field)}</div>
    <div class="field-bar-track"><div class="field-bar-fill" style="width:${pct}%"></div></div>
    <div class="field-bar-pct">${changed}/${total} (${pct}%)</div>
  `;
  return wrapper;
}

async function loadInsights() {
  const type = document.querySelector('input[name="insightsType"]:checked').value;
  const response = await fetch('/api/insights');
  const data = await response.json();
  const d = data[type];

  activityCards.innerHTML = '';
  activityCards.appendChild(renderStatCard('Total runs logged', d.activity.totalRuns));
  activityCards.appendChild(renderStatCard('Pushed to Strapi', d.activity.pushedCount));
  activityCards.appendChild(renderStatCard('Confirmed published (captured)', d.activity.publishedCount));

  fieldStatsEl.innerHTML = '';
  const fields = Object.entries(d.fieldStats).sort((a, b) => (b[1].changed / b[1].total) - (a[1].changed / a[1].total));
  if (fields.length === 0) {
    fieldStatsEl.innerHTML = '<p class="hint">No runs yet with a valid metadata baseline to compare — needs at least one push formatted and published through this tool.</p>';
  } else {
    fields.forEach(([field, stats]) => {
      fieldStatsEl.appendChild(renderFieldBar(field, stats.changed, stats.total));
    });
  }

  const desc = d.descriptionStats;
  descriptionStatEl.innerHTML = desc.total > 0
    ? `<label>Description text</label><span>changed in ${desc.changed} of ${desc.total} published runs</span>`
    : '<label>Description text</label><span class="hint">No published runs yet</span>';

  currentVersionEl.textContent = `Active version: ${d.prompt.currentVersion}`;
  changelogEl.innerHTML = d.prompt.changelog ? renderMarkdownish(d.prompt.changelog) : '<p class="hint">No changelog section found.</p>';

  if (d.prompt.pendingProposal) {
    proposalSection.hidden = false;
    proposalFileNameEl.textContent = `prompts/${d.prompt.pendingProposal.fileName}`;
    proposalAnalysisEl.innerHTML = renderMarkdownish(d.prompt.pendingProposal.patternAnalysis);
  } else {
    proposalSection.hidden = true;
  }
}

document.querySelectorAll('input[name="insightsType"]').forEach((el) => {
  el.addEventListener('change', loadInsights);
});

loadInsights();
