const formatBtn = document.getElementById('formatBtn');
const statusEl = document.getElementById('status');
const sourceInput = document.getElementById('sourceInput');
const resultsEl = document.getElementById('results');
const fieldsContainer = document.getElementById('fieldsContainer');
const descriptionBox = document.getElementById('descriptionBox');
const reviewFlagsBanner = document.getElementById('reviewFlagsBanner');
const lookupPanel = document.getElementById('lookupPanel');
const pushBtn = document.getElementById('pushBtn');
const pushStatus = document.getElementById('pushStatus');

const FIELD_LABELS = {
  title: 'Title',
  companyName: 'Company',
  name: 'Name',
  location: 'Location',
  jobType: 'Job Type',
  experienceLevel: 'Experience Level',
  salary: 'Salary',
  closingDate: 'Closing Date',
  applicationUrl: 'Application URL',
  applicationEmail: 'Application Email',
  categories: 'Categories (Job Category)',
  impactArea: 'Impact Area (Area of Work)',
  skills: 'Skills',
  keywords: 'Keywords (SEO, not shown to visitors)',
  excerpt: 'Excerpt',
  metaTitle: 'Meta Title',
  metaDescription: 'Meta Description',
  website: 'Website',
  size: 'Company Size',
  industry: 'Industry',
  'socialCard.title': 'X/Twitter Card Title',
  'socialCard.description': 'X/Twitter Card Description',
  linkedinPost: 'LinkedIn Post',
};

// Fields that are comma-joined for display but need to become arrays again on push.
const ARRAY_FIELDS = { job: ['categories', 'skills', 'keywords'], company: [] };

// Fields shown for the operator's convenience but that aren't real Strapi
// schema fields — never sent on push.
const PUSH_EXCLUDE_KEYS = new Set(['socialCard.title', 'socialCard.description', 'linkedinPost']);

// Hard DB-enforced limits on Job/Company (checked server-side too, and
// clamped before push — this is just so it's visible while editing).
const FIELD_MAX_LENGTHS = { metaTitle: 60, metaDescription: 160 };

let currentRunId = null;
let currentType = null;

function fieldValueToText(value) {
  if (Array.isArray(value)) return value.join(', ');
  if (value === null || value === undefined) return '';
  return String(value);
}

function renderField(key, value, reviewFlags) {
  const wrapper = document.createElement('div');
  wrapper.className = 'field-box';
  if (reviewFlags.includes(key)) {
    wrapper.classList.add('needs-review');
  }

  const label = document.createElement('label');
  label.textContent = FIELD_LABELS[key] || key;
  if (reviewFlags.includes(key)) {
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = 'AI judgment — check this';
    label.appendChild(badge);
  }

  const input = document.createElement('textarea');
  input.rows = value && value.length > 80 ? 3 : 1;
  input.value = fieldValueToText(value);
  input.dataset.key = key;

  const copyBtn = document.createElement('button');
  copyBtn.className = 'copy-btn';
  copyBtn.textContent = 'Copy';
  copyBtn.addEventListener('click', () => copyToClipboard(input.value, copyBtn));

  wrapper.appendChild(label);

  const maxLength = FIELD_MAX_LENGTHS[key];
  if (maxLength) {
    const counter = document.createElement('span');
    counter.className = 'char-counter';
    const updateCounter = () => {
      const len = input.value.length;
      counter.textContent = `${len} / ${maxLength} characters`;
      counter.classList.toggle('over-limit', len > maxLength);
    };
    input.addEventListener('input', updateCounter);
    updateCounter();
    label.appendChild(counter);
  }

  wrapper.appendChild(input);
  wrapper.appendChild(copyBtn);
  return wrapper;
}

function copyToClipboard(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = original; }, 1200);
  });
}

function renderLookup(categoryChecks, companyCheck) {
  lookupPanel.innerHTML = '';
  const heading = document.createElement('h3');
  heading.textContent = 'Taxonomy check (Strapi, read-only)';
  lookupPanel.appendChild(heading);

  if (companyCheck) {
    const p = document.createElement('p');
    if (companyCheck.error) {
      p.textContent = `Company lookup skipped: ${companyCheck.error}`;
    } else {
      p.textContent = companyCheck.exists
        ? `Company "${companyCheck.name}" already exists in Strapi.`
        : `Company "${companyCheck.name}" does not exist yet — format and push its company profile before pushing this job.`;
      p.className = companyCheck.exists ? 'lookup-ok' : 'lookup-new';
    }
    lookupPanel.appendChild(p);
  }

  (categoryChecks || []).forEach((c) => {
    const p = document.createElement('p');
    p.textContent = c.exists
      ? `Category "${c.name}" already exists in Strapi.`
      : `Category "${c.name}" does not exist yet — will be created automatically on push.`;
    p.className = c.exists ? 'lookup-ok' : 'lookup-new';
    lookupPanel.appendChild(p);
  });
}

/** Reads the current (possibly hand-edited) values out of the review boxes. */
function collectEditedMetadata() {
  const metadata = {};
  const arrayFields = new Set(ARRAY_FIELDS[currentType] || []);

  fieldsContainer.querySelectorAll('textarea[data-key]').forEach((el) => {
    const key = el.dataset.key;
    if (PUSH_EXCLUDE_KEYS.has(key)) return;
    metadata[key] = arrayFields.has(key)
      ? el.value.split(',').map((s) => s.trim()).filter(Boolean)
      : el.value;
  });

  return metadata;
}

formatBtn.addEventListener('click', async () => {
  const type = document.querySelector('input[name="type"]:checked').value;
  const input = sourceInput.value.trim();
  if (!input) return;

  formatBtn.disabled = true;
  statusEl.textContent = 'Formatting with Claude... this can take up to a minute.';
  resultsEl.hidden = true;
  pushStatus.textContent = '';
  pushBtn.disabled = false;

  try {
    const response = await fetch('/api/format', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, input }),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Format failed');
    }

    const { runId, metadata, description, categoryChecks, companyCheck } = data;
    const reviewFlags = metadata.reviewFlags || [];

    currentRunId = runId;
    currentType = type;

    fieldsContainer.innerHTML = '';
    Object.entries(metadata).forEach(([key, value]) => {
      if (key === 'reviewFlags') return;
      if (key === 'socialCard' && value && typeof value === 'object') {
        fieldsContainer.appendChild(renderField('socialCard.title', value.title, reviewFlags));
        fieldsContainer.appendChild(renderField('socialCard.description', value.description, reviewFlags));
        return;
      }
      fieldsContainer.appendChild(renderField(key, value, reviewFlags));
    });

    descriptionBox.value = description;

    if (reviewFlags.length) {
      reviewFlagsBanner.hidden = false;
      reviewFlagsBanner.textContent = `Claude flagged these as judgment calls, not direct extractions: ${reviewFlags.join(', ')}. Double-check them before publishing.`;
    } else {
      reviewFlagsBanner.hidden = true;
    }

    renderLookup(categoryChecks, companyCheck);

    resultsEl.hidden = false;
    statusEl.textContent = '';
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
  } finally {
    formatBtn.disabled = false;
  }
});

document.querySelector('[data-copy-target="descriptionBox"]').addEventListener('click', (e) => {
  copyToClipboard(descriptionBox.value, e.target);
});

pushBtn.addEventListener('click', async () => {
  if (!currentRunId || !currentType) return;

  pushBtn.disabled = true;
  pushStatus.textContent = 'Pushing to Strapi...';

  try {
    const metadata = collectEditedMetadata();
    const description = descriptionBox.value;

    const response = await fetch('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId: currentRunId, type: currentType, metadata, description }),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Push failed');
    }

    pushStatus.innerHTML = `Pushed as draft (id ${data.entryId}). <a href="${data.adminUrl}" target="_blank" rel="noopener noreferrer">Open in Strapi to review and publish</a>.`;
  } catch (err) {
    pushStatus.textContent = `Error: ${err.message}`;
    pushBtn.disabled = false;
  }
});
