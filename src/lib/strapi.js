const STRAPI_API_URL = process.env.STRAPI_API_URL || 'https://aikyamjobs.org/api';
const API_TOKEN = process.env.STRAPI_API_TOKEN;

function apiOrigin() {
  return STRAPI_API_URL.replace(/\/api\/?$/, '');
}

function requireToken() {
  if (!API_TOKEN) {
    throw new Error('STRAPI_API_TOKEN is not set — add it to .env');
  }
}

async function strapiRequest(method, endpoint, body) {
  requireToken();

  const response = await fetch(`${STRAPI_API_URL}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const responseBody = await response.text();
    const error = new Error(`Strapi ${method} ${endpoint} failed: ${response.status} ${responseBody.slice(0, 500)}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

const strapiGet = (endpoint) => strapiRequest('GET', endpoint);
const strapiPost = (endpoint, data) => strapiRequest('POST', endpoint, { data });
const strapiPut = (endpoint, data) => strapiRequest('PUT', endpoint, { data });

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Checks each proposed category name against existing Strapi categories
 * (case-insensitive, matched by slug). Read-only — never creates anything.
 * Returns [{ name, exists, id }] so the review screen can show which
 * categories already exist vs. which would need to be created on push.
 */
async function checkCategories(names) {
  const results = [];
  for (const name of names) {
    const slug = slugify(name);
    const data = await strapiGet(`/categories?filters[slug][$eq]=${encodeURIComponent(slug)}`);
    const found = data.data && data.data[0];
    results.push({
      name,
      slug,
      exists: Boolean(found),
      id: found ? found.id : null,
    });
  }
  return results;
}

/**
 * Checks a proposed company name against existing Strapi companies
 * (case-insensitive, matched by slug). Read-only — never creates anything.
 */
async function checkCompany(name) {
  if (!name) {
    return { name: null, exists: false, id: null };
  }
  const slug = slugify(name);
  const data = await strapiGet(`/companies?filters[slug][$eq]=${encodeURIComponent(slug)}`);
  const found = data.data && data.data[0];
  return {
    name,
    slug,
    exists: Boolean(found),
    id: found ? found.id : null,
    // Strapi 5 single-entry routes (PUT /companies/:x) take the documentId,
    // not the numeric id — see upsertCompanyDraft.
    documentId: found ? found.documentId : null,
  };
}

/**
 * Searches existing Job/Company entries by partial, case-insensitive name
 * match against Strapi's own data — never touches LinkedIn/DevNetJobsIndia
 * or any third-party site. Powers the "has this already been posted?"
 * quick check, so Greeshma can tell before she spends time formatting
 * something that's already on the site.
 */
async function searchJobs({ title, companyName } = {}) {
  const params = new URLSearchParams();
  if (title) params.set('filters[title][$containsi]', title);
  if (companyName) params.set('filters[company][name][$containsi]', companyName);
  params.set('populate', 'company');
  params.set('pagination[pageSize]', '10');

  // Strapi 5 responses are flat: fields sit directly on the entry, and a
  // populated relation is the related entry itself (no data/attributes wrapper).
  const data = await strapiGet(`/jobs?${params.toString()}`);
  return (data.data || []).map((entry) => ({
    id: entry.id,
    documentId: entry.documentId,
    title: entry.title,
    companyName: entry.company?.name ?? null,
    slug: entry.slug,
    publishedAt: entry.publishedAt,
  }));
}

async function searchCompanies(name) {
  const params = new URLSearchParams();
  params.set('filters[name][$containsi]', name || '');
  params.set('pagination[pageSize]', '10');

  const data = await strapiGet(`/companies?${params.toString()}`);
  return (data.data || []).map((entry) => ({
    id: entry.id,
    documentId: entry.documentId,
    name: entry.name,
    slug: entry.slug,
    publishedAt: entry.publishedAt,
  }));
}

/**
 * Fetches every page of a Strapi collection, mapping each raw entry through
 * `mapEntry`. `extraParams` is cloned per page rather than mutated, so
 * callers can pass one URLSearchParams in without it accumulating repeated
 * pagination keys across iterations.
 */
async function fetchAllPages(endpoint, extraParams, mapEntry) {
  const results = [];
  let page = 1;
  const pageSize = 100;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const params = new URLSearchParams(extraParams);
    params.set('pagination[page]', String(page));
    params.set('pagination[pageSize]', String(pageSize));

    const data = await strapiGet(`/${endpoint}?${params.toString()}`);
    results.push(...(data.data || []).map(mapEntry));

    const pageCount = data.meta?.pagination?.pageCount ?? 1;
    if (page >= pageCount) break;
    page += 1;
  }

  return results;
}

/**
 * Every published job with a non-empty applicationUrl — paginated, since
 * there could be hundreds. Filters client-side rather than via a Strapi
 * $notNull query, since some older jobs may have an empty string rather
 * than a true null, which $notNull wouldn't catch.
 */
async function getAllPublishedJobsWithApplicationUrl() {
  const params = new URLSearchParams();
  params.set('filters[publishedAt][$notNull]', 'true');
  // Strapi's `fields` param needs array bracket notation — a comma-joined
  // string (fields=a,b,c) is rejected outright with a 400 ValidationError.
  params.set('fields[0]', 'title');
  params.set('fields[1]', 'applicationUrl');
  params.set('fields[2]', 'slug');

  const all = await fetchAllPages('jobs', params, (entry) => ({
    id: entry.id,
    documentId: entry.documentId,
    title: entry.title,
    applicationUrl: entry.applicationUrl,
    slug: entry.slug,
  }));
  return all.filter((job) => job.applicationUrl && job.applicationUrl.trim());
}

/**
 * The most recently published jobs (title, slug, description, updatedAt) —
 * for the quality-audit tab. Deliberately NOT every published job: most of
 * the ~370 published jobs are old or migrated-from-Ghost residue nobody's
 * going back to edit, and auditing all of them costs real Claude quota (the
 * mac mini's subscription has a weekly limit already hit once) and real
 * Lighthouse time for no real benefit — a fix only actually happens on
 * postings someone still cares about, which skews recent. updatedAt lets
 * the checker skip re-auditing a job that hasn't changed since last time.
 */
async function getRecentPublishedJobsForQualityAudit(limit = 25) {
  const params = new URLSearchParams();
  params.set('filters[publishedAt][$notNull]', 'true');
  params.set('fields[0]', 'title');
  params.set('fields[1]', 'slug');
  params.set('fields[2]', 'description');
  params.set('fields[3]', 'updatedAt');
  params.set('sort[0]', 'publishedAt:desc');
  params.set('pagination[pageSize]', String(limit));
  params.set('pagination[page]', '1');

  const data = await strapiGet(`/jobs?${params.toString()}`);
  return (data.data || [])
    .map((entry) => ({
      id: entry.id,
      documentId: entry.documentId,
      title: entry.title,
      slug: entry.slug,
      description: entry.description,
      updatedAt: entry.updatedAt,
    }))
    .filter((job) => job.description && job.description.trim());
}

/** The live public job page URL — this is what a candidate actually sees
 * (and what Lighthouse should audit), not the Strapi API/admin origin. */
function publicJobUrl(slug) {
  return `${apiOrigin()}/jobs/${slug}`;
}

/**
 * The inverse of publicJobUrl — pulls the slug back out of a pasted live job
 * URL for the quality tab's "check this URL" input. Only accepts a URL on
 * this instance's own configured origin (not just any site's /jobs/<slug>
 * shape) — otherwise a pasted URL to an unrelated host would get handed
 * straight to a real Lighthouse/headless-Chrome run against it. Returns null
 * for anything that isn't a valid same-origin /jobs/<slug> URL.
 */
function slugFromJobUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.origin !== apiOrigin()) return null;
  const match = parsed.pathname.match(/^\/jobs\/([^/]+)\/?$/);
  return match ? match[1] : null;
}

/**
 * Fetches one published job by exact slug, in the same shape
 * getRecentPublishedJobsForQualityAudit uses — for the quality tab's
 * "check this URL" input, which (unlike the picker dropdown) isn't limited
 * to the most recently published jobs. Returns null if no published job
 * matches.
 */
async function getPublishedJobBySlug(slug) {
  const params = new URLSearchParams();
  params.set('filters[slug][$eq]', slug);
  params.set('filters[publishedAt][$notNull]', 'true');
  params.set('fields[0]', 'title');
  params.set('fields[1]', 'slug');
  params.set('fields[2]', 'description');
  params.set('fields[3]', 'updatedAt');

  const data = await strapiGet(`/jobs?${params.toString()}`);
  const entry = data.data && data.data[0];
  if (!entry) return null;

  return {
    id: entry.id,
    documentId: entry.documentId,
    title: entry.title,
    slug: entry.slug,
    description: entry.description,
    updatedAt: entry.updatedAt,
  };
}

const COMPANY_NAME_NOISE_WORDS = new Set([
  'the', 'ltd', 'limited', 'pvt', 'private', 'llp', 'inc', 'incorporated', 'co',
]);

/** Lowercases, drops punctuation, and strips generic corporate suffixes/prefixes
 * ("The", "Ltd", "Pvt", ...) so "The Clinton Health Access Initiative (CHAI)"
 * and "CHAI" share enough tokens to be compared meaningfully. Deliberately
 * does NOT strip words like "Foundation" or "Trust" — for an NGO those are
 * often the most distinctive part of the name, not noise. */
function normalizeCompanyName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word && !COMPANY_NAME_NOISE_WORDS.has(word))
    .join(' ')
    .trim();
}

/** Word-overlap (Jaccard) similarity between two already-normalized names,
 * with a bonus when one is a substring of the other — catches the common
 * "CRY" vs "Child Rights and You - CRY" case, where overlap alone is weak
 * (CRY is one word out of many) but containment is a strong signal. */
function companyNameSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const aWords = new Set(a.split(' '));
  const bWords = new Set(b.split(' '));
  const intersection = [...aWords].filter((w) => bWords.has(w)).length;
  const union = new Set([...aWords, ...bWords]).size;
  const jaccard = union > 0 ? intersection / union : 0;
  const substringBonus = a.includes(b) || b.includes(a) ? 0.3 : 0;
  return Math.min(1, jaccard + substringBonus);
}

/**
 * Fuzzy match against every company in Strapi (189 companies at the time
 * this was written — small enough to fetch in full and compare in memory,
 * which is far more reliable than Strapi's $containsi for names that differ
 * by a "The"/"Ltd"/abbreviation). Used only as a fallback when the
 * exact-match lookup (checkCompany) fails, to surface likely existing
 * matches instead of prompting to create a duplicate company profile.
 */
async function findSimilarCompanies(name, { limit = 5, minScore = 0.3 } = {}) {
  const target = normalizeCompanyName(name);
  if (!target) return [];

  const params = new URLSearchParams();
  params.set('fields[0]', 'name');
  params.set('fields[1]', 'slug');
  const all = await fetchAllPages('companies', params, (entry) => ({
    id: entry.id,
    name: entry.name,
    slug: entry.slug,
  }));

  return all
    .map((c) => ({ ...c, score: companyNameSimilarity(target, normalizeCompanyName(c.name)) }))
    .filter((c) => c.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Looks up a category by name; creates it (name + slug only, no description —
 * matches the existing create-missing-categories.js convention) if missing.
 * Categories are low-stakes shared taxonomy, so auto-create on push is fine.
 */
async function findOrCreateCategory(name) {
  const slug = slugify(name);
  const existing = await strapiGet(`/categories?filters[slug][$eq]=${encodeURIComponent(slug)}`);
  const found = existing.data && existing.data[0];
  if (found) return found.documentId;

  const created = await strapiPost('/categories', { name, slug });
  return created.data.documentId;
}

/**
 * Companies are NOT auto-created from a job push — a job prompt only
 * extracts a bare company name, not a real profile, and creating a shell
 * company with no description would be worse than the current manual
 * workflow. The caller must format + push the company profile first.
 */
async function requireExistingCompanyId(name) {
  const check = await checkCompany(name);
  if (!check.exists) {
    throw new Error(
      `Company "${name}" does not exist in Strapi yet. Format and push its company profile first, then push this job.`
    );
  }
  return check.documentId;
}

// Repeatable `apply.checklist-item` component on Job: { label, required, weight }.
// weight is a schema-constrained integer 1-10 (min/max enforced in Strapi); the
// prompt asks Claude to stay in range, but a stray float/out-of-range value would
// be rejected by Strapi, so clamp deterministically here. Items with no usable
// label are dropped rather than sent as an invalid component.
const CHECKLIST_WEIGHT_MIN = 1;
const CHECKLIST_WEIGHT_MAX = 10;

function sanitizeChecklist(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const label = typeof item.label === 'string' ? item.label.trim() : '';
      if (!label) return null;
      let weight = Math.round(Number(item.weight));
      if (!Number.isFinite(weight)) weight = 1;
      weight = Math.min(CHECKLIST_WEIGHT_MAX, Math.max(CHECKLIST_WEIGHT_MIN, weight));
      return { label, required: item.required === true, weight };
    })
    .filter(Boolean);
}

function stripEmpty(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined || value === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key] = value;
  }
  return out;
}

function toIsoDateOrUndefined(value) {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

// metaTitle/metaDescription have hard DB-enforced maxLength constraints
// (60 / 160) on both Job and Company. The prompt asks Claude to stay within
// these, but an LLM's own character count is not reliable right at a
// boundary — enforce it deterministically here rather than trusting that.
const META_TITLE_MAX = 60;
const META_DESCRIPTION_MAX = 160;

function clampToLength(text, maxLength) {
  if (!text || text.length <= maxLength) return text;
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  // Cut at the last word boundary, unless that would throw away too much
  // (an unusually early space), in which case just hard-cut at the limit.
  return lastSpace > maxLength * 0.6 ? truncated.slice(0, lastSpace) : truncated;
}

/**
 * title/name are `uid` (slug) fields marked required in the schema. The
 * Strapi admin UI auto-generates these when you type interactively, but the
 * plain REST API does not — a create POST without an explicit slug fails
 * validation ("slug must be defined"). We generate one ourselves and, since
 * uid fields are unique, disambiguate with a numeric suffix on collision
 * (mirrors what the admin UI's own uid-generation does).
 */
async function generateUniqueSlug(plural, name) {
  const base = slugify(name);
  let candidate = base;
  let suffix = 2;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const data = await strapiGet(`/${plural}?filters[slug][$eq]=${encodeURIComponent(candidate)}`);
    if (!data.data || data.data.length === 0) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

/**
 * Creates a Job entry as a Draft (?status=draft — Strapi's
 * draftAndPublish leaves it unpublished until someone publishes it in the
 * admin). Resolves company (must already exist) and categories (created if
 * missing) to Strapi relation ids first.
 */
async function createJobDraft(metadata, description) {
  const companyId = await requireExistingCompanyId(metadata.companyName);
  const categoryNames = Array.isArray(metadata.categories) ? metadata.categories : [];
  const categoryIds = [];
  for (const name of categoryNames) {
    categoryIds.push(await findOrCreateCategory(name));
  }
  const slug = await generateUniqueSlug('jobs', metadata.title);

  const checklist = sanitizeChecklist(metadata.requirementChecklist);
  const applyMode = metadata.applyMode;
  // Strapi's own job lifecycle refuses to save applyMode "gated" without at
  // least one checklist item (that guard is what stops the "Apply with
  // aikyamjobs" button appearing on an unprepped JD). Fail early here with a
  // clear message rather than letting it surface as a raw 400 from Strapi.
  if (applyMode === 'gated' && checklist.length === 0) {
    throw new Error(
      'applyMode is "gated" but the requirement checklist is empty. Add at least one checklist item (or set apply mode to external) before pushing.'
    );
  }

  const payload = stripEmpty({
    title: metadata.title,
    slug,
    description,
    location: metadata.location,
    jobType: metadata.jobType,
    experienceLevel: metadata.experienceLevel,
    salary: metadata.salary,
    closingDate: toIsoDateOrUndefined(metadata.closingDate),
    applicationUrl: metadata.applicationUrl,
    applicationEmail: metadata.applicationEmail,
    applyMode,
    requirementChecklist: checklist,
    skills: metadata.skills,
    keywords: metadata.keywords,
    impactArea: metadata.impactArea,
    excerpt: metadata.excerpt,
    metaTitle: clampToLength(metadata.metaTitle, META_TITLE_MAX),
    metaDescription: clampToLength(metadata.metaDescription, META_DESCRIPTION_MAX),
  });
  // Strapi 5 links relations by documentId — a numeric id here is silently
  // ignored (the job saves with no company/categories, no error), so both
  // helpers above return documentIds.
  payload.company = companyId;
  payload.categories = categoryIds;

  // On this Strapi 5 instance a create with no ?status publishes immediately,
  // and a publishedAt: null in the body is ignored (v4's way of asking for a
  // draft) — confirmed against the live API. ?status=draft is what keeps it
  // a draft until someone publishes it in the admin.
  const created = await strapiPost('/jobs?status=draft', payload);
  return created.data;
}

/**
 * Creates or updates a Company entry. Update path is used when the operator
 * is refreshing/correcting a profile that already exists (matched by slug).
 * Also created (or updated) as a Draft — ?status=draft.
 */
async function upsertCompanyDraft(metadata, description) {
  const existing = await checkCompany(metadata.name);

  const payload = stripEmpty({
    name: metadata.name,
    description,
    website: metadata.website,
    location: metadata.location,
    size: metadata.size,
    industry: metadata.industry,
    excerpt: metadata.excerpt,
    metaTitle: clampToLength(metadata.metaTitle, META_TITLE_MAX),
    metaDescription: clampToLength(metadata.metaDescription, META_DESCRIPTION_MAX),
  });

  if (existing.exists) {
    // Don't touch slug on update — changing it would change the company's
    // published URL, and the name (hence slug) already matched on lookup.
    // Strapi 5's single-entry routes need the documentId — the numeric id
    // 404s. As with create, a PUT without ?status=draft publishes the entry
    // straight away; with it, the change lands in the draft for review and
    // goes live when someone publishes it in the admin.
    const updated = await strapiPut(`/companies/${existing.documentId}?status=draft`, payload);
    return updated.data;
  }
  payload.slug = await generateUniqueSlug('companies', metadata.name);
  // See the comment in createJobDraft — ?status=draft is what makes a draft.
  const created = await strapiPost('/companies?status=draft', payload);
  return created.data;
}

/**
 * Strapi 5's admin edit view resolves documents by documentId — a numeric id
 * here lands on the admin's "Whoops! Something went wrong" screen. Returns
 * null when no documentId is known (e.g. rows logged before the v5 upgrade),
 * so callers can hide the link rather than show a broken one.
 */
function adminEditUrl(contentType, documentId) {
  if (!documentId) return null;
  return `${apiOrigin()}/admin/content-manager/collection-types/api::${contentType}.${contentType}/${documentId}`;
}

function normalizeJobAttributes(a) {
  return {
    title: a.title,
    companyName: a.company?.name ?? null,
    location: a.location,
    jobType: a.jobType,
    experienceLevel: a.experienceLevel,
    salary: a.salary,
    closingDate: a.closingDate,
    applicationUrl: a.applicationUrl,
    applicationEmail: a.applicationEmail,
    applyMode: a.applyMode,
    // Repeatable component comes back as a plain array (not the {data:[...]}
    // relation wrapper). Normalize to the same {label, required, weight} shape
    // the tool sends, dropping Strapi's per-item id/internal keys.
    requirementChecklist: (Array.isArray(a.requirementChecklist) ? a.requirementChecklist : [])
      .map((item) => ({ label: item.label, required: item.required === true, weight: item.weight })),
    categories: (Array.isArray(a.categories) ? a.categories : []).map((c) => c.name),
    impactArea: a.impactArea,
    skills: a.skills,
    keywords: a.keywords,
    excerpt: a.excerpt,
    metaTitle: a.metaTitle,
    metaDescription: a.metaDescription,
  };
}

function normalizeCompanyAttributes(a) {
  return {
    name: a.name,
    website: a.website,
    location: a.location,
    size: a.size,
    industry: a.industry,
    excerpt: a.excerpt,
    metaTitle: a.metaTitle,
    metaDescription: a.metaDescription,
  };
}

/**
 * Fetches a single Job or Company by documentId and normalizes it down to the
 * same flat shape used for ai_metadata, so the poller can store a directly
 * comparable "final" snapshot. Used by the publish-poller.
 *
 * Strapi 5 keeps a draft and a published version per document, and a plain
 * GET returns only the published one — 404 if the document has never been
 * published (or was unpublished). That's not "deleted", so on 404 this checks
 * for a draft and reports { publishedAt: null } if one exists, matching v4's
 * "exists but not live" response. A 404 on both means the document is gone.
 */
async function getEntrySnapshot(contentType, documentId) {
  const plural = contentType === 'job' ? 'jobs' : 'companies';
  const populate = contentType === 'job' ? 'company,categories,requirementChecklist' : '';
  const query = populate ? `?populate=${populate}` : '';

  let data;
  try {
    ({ data } = await strapiGet(`/${plural}/${documentId}${query}`));
  } catch (err) {
    if (err.status !== 404) throw err;
    await strapiGet(`/${plural}/${documentId}?status=draft`); // rethrows 404 if truly deleted
    return { publishedAt: null, metadata: null, description: null };
  }

  return {
    publishedAt: data.publishedAt,
    metadata: contentType === 'job' ? normalizeJobAttributes(data) : normalizeCompanyAttributes(data),
    description: data.description,
  };
}

module.exports = {
  strapiGet,
  checkCategories,
  checkCompany,
  slugify,
  findOrCreateCategory,
  createJobDraft,
  upsertCompanyDraft,
  adminEditUrl,
  getEntrySnapshot,
  searchJobs,
  searchCompanies,
  getAllPublishedJobsWithApplicationUrl,
  getRecentPublishedJobsForQualityAudit,
  publicJobUrl,
  slugFromJobUrl,
  getPublishedJobBySlug,
  findSimilarCompanies,
};
