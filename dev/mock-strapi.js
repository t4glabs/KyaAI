/**
 * A tiny fake of the Strapi v4 REST endpoints this tool actually uses
 * (filters-by-slug GET, POST, PUT, single-entry GET with populate), for
 * testing the push/poll logic locally without touching the real
 * aikyamjobs.org Strapi instance. Not part of the shipped tool.
 *
 * Enforces the same required-field validation as the real schema (title/
 * name/description/slug) so a bug like "forgot to send slug" fails here
 * too, instead of only surfacing against production.
 *
 * Run: node dev/mock-strapi.js [port]
 * Then point .env at it: STRAPI_API_URL=http://localhost:<port>
 *                        STRAPI_API_TOKEN=anything
 */
const express = require('express');

const app = express();
app.use(express.json());

const PORT = process.argv[2] || 4321;

let nextId = 1;
const categories = [];
const companies = [];
const jobs = [];

function slugify(name) {
  return String(name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function wrap(record) {
  const { id, ...attributes } = record;
  return { id, attributes };
}

function findBySlugQuery(list, req) {
  const slug = req.query?.filters?.slug?.$eq;
  if (!slug) return list;
  return list.filter((r) => r.slug === slug);
}

function validationError(res, field, message) {
  res.status(400).json({
    data: null,
    error: {
      status: 400,
      name: 'ValidationError',
      message,
      details: { errors: [{ path: [field], message, name: 'ValidationError' }] },
    },
  });
}

/** Mirrors Strapi's ValidationError response shape for required fields. */
function requireFields(data, fields, res) {
  for (const field of fields) {
    if (data[field] === undefined || data[field] === null || data[field] === '') {
      validationError(res, field, `${field} must be defined.`);
      return false;
    }
  }
  return true;
}

/** Mirrors Strapi's maxLength ValidationError, e.g. for metaTitle/metaDescription. */
function checkMaxLengths(data, limits, res) {
  for (const [field, max] of Object.entries(limits)) {
    if (typeof data[field] === 'string' && data[field].length > max) {
      validationError(res, field, `${field} must be at most ${max} characters`);
      return false;
    }
  }
  return true;
}

const META_LIMITS = { metaTitle: 60, metaDescription: 160 };

/**
 * Mirrors Strapi's actual core create-service behavior for draftAndPublish
 * content types (verified against node_modules/@strapi/strapi/dist/core-api/
 * service/collection-type.js): publishedAt defaults to "now" if the key is
 * absent from the payload. Explicitly passing publishedAt: null keeps it a
 * draft. Omitting it is NOT the same as draft — it means published.
 */
function applyPublishedAtDefault(data) {
  if (!('publishedAt' in data)) {
    data.publishedAt = new Date().toISOString();
  }
}

// --- categories ---
app.get('/categories', (req, res) => {
  res.json({ data: findBySlugQuery(categories, req).map(wrap) });
});
app.post('/categories', (req, res) => {
  if (!requireFields(req.body.data, ['name', 'slug'], res)) return;
  const record = { id: nextId++, ...req.body.data };
  categories.push(record);
  console.log(`[mock-strapi] created category #${record.id}: ${record.name}`);
  res.json({ data: wrap(record) });
});

// --- companies ---
app.get('/companies', (req, res) => {
  res.json({ data: findBySlugQuery(companies, req).map(wrap) });
});
app.post('/companies', (req, res) => {
  if (!requireFields(req.body.data, ['name', 'slug'], res)) return;
  if (!checkMaxLengths(req.body.data, META_LIMITS, res)) return;
  applyPublishedAtDefault(req.body.data);
  const record = { id: nextId++, ...req.body.data };
  companies.push(record);
  console.log(`[mock-strapi] created company #${record.id}: ${record.name}`);
  res.json({ data: wrap(record) });
});
app.put('/companies/:id', (req, res) => {
  const record = companies.find((c) => c.id === Number(req.params.id));
  if (!record) return res.status(404).json({ error: 'not found' });
  if (!checkMaxLengths(req.body.data, META_LIMITS, res)) return;
  Object.assign(record, req.body.data);
  console.log(`[mock-strapi] updated company #${record.id}`);
  res.json({ data: wrap(record) });
});
app.get('/companies/:id', (req, res) => {
  const record = companies.find((c) => c.id === Number(req.params.id));
  if (!record) return res.status(404).json({ error: 'not found' });
  res.json({ data: wrap(record) });
});

// --- jobs ---
app.get('/jobs', (req, res) => {
  res.json({ data: findBySlugQuery(jobs, req).map(wrap) });
});
app.post('/jobs', (req, res) => {
  if (!requireFields(req.body.data, ['title', 'slug', 'description'], res)) return;
  if (!checkMaxLengths(req.body.data, META_LIMITS, res)) return;
  applyPublishedAtDefault(req.body.data);
  const record = { id: nextId++, ...req.body.data };
  jobs.push(record);
  console.log(`[mock-strapi] created job #${record.id}: ${record.title} (publishedAt=${record.publishedAt})`);
  res.json({ data: wrap(record) });
});
app.get('/jobs/:id', (req, res) => {
  const record = jobs.find((j) => j.id === Number(req.params.id));
  if (!record) return res.status(404).json({ error: 'not found' });

  const company = companies.find((c) => c.id === record.company);
  const jobCategories = categories.filter((c) => (record.categories || []).includes(c.id));

  const attributes = {
    ...record,
    company: company ? { data: wrap(company) } : { data: null },
    categories: { data: jobCategories.map(wrap) },
  };
  delete attributes.id;
  res.json({ data: { id: record.id, attributes } });
});

// --- test-only helpers: simulate Greeshma hitting Publish/Unpublish in the Strapi admin ---
app.post('/_test/publish/:collection/:id', (req, res) => {
  const list = req.params.collection === 'jobs' ? jobs : companies;
  const record = list.find((r) => r.id === Number(req.params.id));
  if (!record) return res.status(404).json({ error: 'not found' });
  record.publishedAt = new Date().toISOString();
  console.log(`[mock-strapi] published ${req.params.collection} #${record.id}`);
  res.json({ ok: true });
});
app.post('/_test/unpublish/:collection/:id', (req, res) => {
  const list = req.params.collection === 'jobs' ? jobs : companies;
  const record = list.find((r) => r.id === Number(req.params.id));
  if (!record) return res.status(404).json({ error: 'not found' });
  record.publishedAt = null;
  console.log(`[mock-strapi] unpublished ${req.params.collection} #${record.id}`);
  res.json({ ok: true });
});
// --- test-only helper: simulate editing fields directly in the Strapi admin ---
app.post('/_test/edit/:collection/:id', (req, res) => {
  const list = req.params.collection === 'jobs' ? jobs : companies;
  const record = list.find((r) => r.id === Number(req.params.id));
  if (!record) return res.status(404).json({ error: 'not found' });
  Object.assign(record, req.body);
  console.log(`[mock-strapi] edited ${req.params.collection} #${record.id}`);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`mock-strapi listening on http://localhost:${PORT}`);
});
