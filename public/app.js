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

const companyPanel = document.getElementById('companyPanel');
const companyPanelName = document.getElementById('companyPanelName');
const companySourceInput = document.getElementById('companySourceInput');
const companyFormatBtn = document.getElementById('companyFormatBtn');
const companyFormatStatus = document.getElementById('companyFormatStatus');
const companyResultWrap = document.getElementById('companyResultWrap');
const companyFieldsContainer = document.getElementById('companyFieldsContainer');
const companyDescriptionBox = document.getElementById('companyDescriptionBox');
const companyPushBtn = document.getElementById('companyPushBtn');
const companyPushStatus = document.getElementById('companyPushStatus');

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
let currentCompanyRunId = null;
let lastCategoryChecks = [];

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

/** Sets the job draft's Company field to an exact existing name and marks
 * it matched, without re-running Claude or re-fetching from Strapi — the
 * suggestion (or a just-created company) already came from Strapi, so the
 * exact name is known good. */
function useExistingCompanyName(name) {
  const companyField = fieldsContainer.querySelector('textarea[data-key="companyName"]');
  if (companyField) companyField.value = name;
  renderLookup(lastCategoryChecks, { name, exists: true });
}

function renderLookup(categoryChecks, companyCheck) {
  lastCategoryChecks = categoryChecks || [];
  lookupPanel.innerHTML = '';
  const heading = document.createElement('h3');
  heading.textContent = 'Taxonomy check (Strapi, read-only)';
  lookupPanel.appendChild(heading);

  if (companyCheck) {
    const p = document.createElement('p');
    if (companyCheck.error) {
      p.textContent = `Company lookup skipped: ${companyCheck.error}`;
    } else if (companyCheck.exists) {
      p.textContent = `Company "${companyCheck.name}" already exists in Strapi.`;
      p.className = 'lookup-ok';
    } else {
      p.textContent = `Company "${companyCheck.name}" was not found by exact name match.`;
      p.className = 'lookup-new';
    }
    lookupPanel.appendChild(p);

    if (!companyCheck.error && !companyCheck.exists) {
      if (companyCheck.suggestions && companyCheck.suggestions.length) {
        const hint = document.createElement('p');
        hint.className = 'hint';
        hint.textContent = 'Possibly one of these — pick one to fix the Company field above instead of creating a duplicate:';
        lookupPanel.appendChild(hint);

        const list = document.createElement('div');
        companyCheck.suggestions.forEach((s) => {
          const btn = document.createElement('button');
          btn.className = 'copy-btn';
          btn.textContent = s.name;
          btn.addEventListener('click', () => useExistingCompanyName(s.name));
          list.appendChild(btn);
        });
        lookupPanel.appendChild(list);
      }

      const genBtn = document.createElement('button');
      genBtn.textContent = companyCheck.suggestions && companyCheck.suggestions.length
        ? "None of these — generate a new company profile"
        : 'Generate a new company profile';
      genBtn.addEventListener('click', () => openCompanyPanel(companyCheck.name));
      lookupPanel.appendChild(genBtn);
    }
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

/** Reads the current (possibly hand-edited) values out of a container's review boxes. */
function collectEditedMetadataFrom(container, type) {
  const metadata = {};
  const arrayFields = new Set(ARRAY_FIELDS[type] || []);

  container.querySelectorAll('textarea[data-key]').forEach((el) => {
    const key = el.dataset.key;
    if (PUSH_EXCLUDE_KEYS.has(key)) return;
    metadata[key] = arrayFields.has(key)
      ? el.value.split(',').map((s) => s.trim()).filter(Boolean)
      : el.value;
  });

  return metadata;
}

function collectEditedMetadata() {
  return collectEditedMetadataFrom(fieldsContainer, currentType);
}

/** Renders every field of a format response's metadata into a container —
 * shared by the main job/company result and the independent company panel. */
function renderMetadataFields(container, metadata, reviewFlags) {
  container.innerHTML = '';
  Object.entries(metadata).forEach(([key, value]) => {
    if (key === 'reviewFlags') return;
    if (key === 'socialCard' && value && typeof value === 'object') {
      container.appendChild(renderField('socialCard.title', value.title, reviewFlags));
      container.appendChild(renderField('socialCard.description', value.description, reviewFlags));
      return;
    }
    container.appendChild(renderField(key, value, reviewFlags));
  });
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
  // A fresh primary format means any open "generate company" side panel was
  // for a different job — hide it rather than leave a stale result attached
  // to the wrong job. This never touches the primary job/company draft itself.
  companyPanel.hidden = true;
  currentCompanyRunId = null;

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

    renderMetadataFields(fieldsContainer, metadata, reviewFlags);
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

document.querySelectorAll('[data-copy-target]').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    const target = document.getElementById(btn.dataset.copyTarget);
    if (target) copyToClipboard(target.value, e.target);
  });
});

/** Opens the independent "generate company profile" panel, prefilled with
 * the company name so the operator can paste more source text around it.
 * Fully separate from the job's own runId/fields — nothing here can affect
 * the job draft above, which is the point: the job stays exactly as
 * formatted even if this panel is opened, filled in, or abandoned. */
function openCompanyPanel(companyName) {
  companyPanel.hidden = false;
  companyPanelName.textContent = companyName;
  companySourceInput.value = companyName;
  companyResultWrap.hidden = true;
  companyFormatStatus.textContent = '';
  currentCompanyRunId = null;
  companyPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

companyFormatBtn.addEventListener('click', async () => {
  const input = companySourceInput.value.trim();
  if (!input) return;

  companyFormatBtn.disabled = true;
  companyFormatStatus.textContent = 'Formatting with Claude... this can take up to a minute.';
  companyResultWrap.hidden = true;

  try {
    const response = await fetch('/api/format', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'company', input }),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Format failed');
    }

    currentCompanyRunId = data.runId;
    const reviewFlags = data.metadata.reviewFlags || [];

    renderMetadataFields(companyFieldsContainer, data.metadata, reviewFlags);
    companyDescriptionBox.value = data.description;

    companyResultWrap.hidden = false;
    companyFormatStatus.textContent = '';
  } catch (err) {
    companyFormatStatus.textContent = `Error: ${err.message}`;
  } finally {
    companyFormatBtn.disabled = false;
  }
});

companyPushBtn.addEventListener('click', async () => {
  if (!currentCompanyRunId) return;

  companyPushBtn.disabled = true;
  companyPushStatus.textContent = 'Pushing to Strapi...';

  try {
    const metadata = collectEditedMetadataFrom(companyFieldsContainer, 'company');
    const description = companyDescriptionBox.value;

    const response = await fetch('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId: currentCompanyRunId, type: 'company', metadata, description }),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Push failed');
    }

    companyPushStatus.innerHTML = `Pushed as draft (id ${data.entryId}). <a href="${data.adminUrl}" target="_blank" rel="noopener noreferrer">Open in Strapi to review and publish</a>.`;

    // Close the loop: fix the job's Company field to the exact name just
    // pushed, so pushing the job afterwards matches this company instead of
    // failing with "company does not exist yet."
    if (metadata.name) {
      useExistingCompanyName(metadata.name);
    }
  } catch (err) {
    companyPushStatus.textContent = `Error: ${err.message}`;
    companyPushBtn.disabled = false;
  }
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
