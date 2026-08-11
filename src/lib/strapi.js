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

  const data = await strapiGet(`/jobs?${params.toString()}`);
  return (data.data || []).map((entry) => ({
    id: entry.id,
    title: entry.attributes.title,
    companyName: entry.attributes.company?.data?.attributes?.name ?? null,
    slug: entry.attributes.slug,
    publishedAt: entry.attributes.publishedAt,
  }));
}

async function searchCompanies(name) {
  const params = new URLSearchParams();
  params.set('filters[name][$containsi]', name || '');
  params.set('pagination[pageSize]', '10');

  const data = await strapiGet(`/companies?${params.toString()}`);
  return (data.data || []).map((entry) => ({
    id: entry.id,
    name: entry.attributes.name,
    slug: entry.attributes.slug,
    publishedAt: entry.attributes.publishedAt,
  }));
}

/**
 * Every published job with a non-empty applicationUrl — paginated, since
 * there could be hundreds. Filters client-side rather than via a Strapi
 * $notNull query, since some older jobs may have an empty string rather
 * than a true null, which $notNull wouldn't catch.
 */
async function getAllPublishedJobsWithApplicationUrl() {
  const results = [];
  let page = 1;
  const pageSize = 100;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const params = new URLSearchParams();
    params.set('filters[publishedAt][$notNull]', 'true');
    // Strapi's `fields` param needs array bracket notation — a comma-joined
    // string (fields=a,b,c) is rejected outright with a 400 ValidationError.
    params.set('fields[0]', 'title');
    params.set('fields[1]', 'applicationUrl');
    params.set('fields[2]', 'slug');
    params.set('pagination[page]', String(page));
    params.set('pagination[pageSize]', String(pageSize));

    const data = await strapiGet(`/jobs?${params.toString()}`);
    const items = (data.data || [])
      .map((entry) => ({
        id: entry.id,
        title: entry.attributes.title,
        applicationUrl: entry.attributes.applicationUrl,
        slug: entry.attributes.slug,
      }))
      .filter((job) => job.applicationUrl && job.applicationUrl.trim());
    results.push(...items);

    const pageCount = data.meta?.pagination?.pageCount ?? 1;
    if (page >= pageCount) break;
    page += 1;
  }

  return results;
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
  if (found) return found.id;

  const created = await strapiPost('/categories', { name, slug });
  return created.data.id;
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
  return check.id;
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
 * Creates a Job entry as a Draft (no publishedAt set — Strapi's
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
    skills: metadata.skills,
    keywords: metadata.keywords,
    impactArea: metadata.impactArea,
    excerpt: metadata.excerpt,
    metaTitle: clampToLength(metadata.metaTitle, META_TITLE_MAX),
    metaDescription: clampToLength(metadata.metaDescription, META_DESCRIPTION_MAX),
  });
  payload.company = companyId;
  payload.categories = categoryIds;
  // Strapi's core create service defaults publishedAt to "now" when the key
  // is absent from the payload — omitting it does NOT mean draft, it means
  // published immediately. Must be explicit. (stripEmpty() above would have
  // silently dropped this if it were included in that object, since it
  // filters out nulls — that's why it's set here, after.)
  payload.publishedAt = null;

  const created = await strapiPost('/jobs', payload);
  return created.data;
}

/**
 * Creates or updates a Company entry. Update path is used when the operator
 * is refreshing/correcting a profile that already exists (matched by slug).
 * Also created as a Draft — no publishedAt set.
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
    const updated = await strapiPut(`/companies/${existing.id}`, payload);
    return updated.data;
  }
  payload.slug = await generateUniqueSlug('companies', metadata.name);
  // See the identical comment in createJobDraft — omitting publishedAt here
  // means "publish immediately," not "draft." Must be explicit.
  payload.publishedAt = null;
  const created = await strapiPost('/companies', payload);
  return created.data;
}

function adminEditUrl(contentType, id) {
  return `${apiOrigin()}/admin/content-manager/collection-types/api::${contentType}.${contentType}/${id}`;
}

function normalizeJobAttributes(a) {
  return {
    title: a.title,
    companyName: a.company?.data?.attributes?.name ?? null,
    location: a.location,
    jobType: a.jobType,
    experienceLevel: a.experienceLevel,
    salary: a.salary,
    closingDate: a.closingDate,
    applicationUrl: a.applicationUrl,
    applicationEmail: a.applicationEmail,
    categories: (a.categories?.data || []).map((c) => c.attributes.name),
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
 * Fetches a single Job or Company by id and normalizes Strapi v4's
 * {id, attributes: {...}} wrapper (and any populated relations) down to the
 * same flat shape used for ai_metadata, so the poller can store a directly
 * comparable "final" snapshot. Used by the publish-poller.
 */
async function getEntrySnapshot(contentType, id) {
  const plural = contentType === 'job' ? 'jobs' : 'companies';
  const populate = contentType === 'job' ? 'company,categories' : '';
  const query = populate ? `?populate=${populate}` : '';
  const { data } = await strapiGet(`/${plural}/${id}${query}`);
  const a = data.attributes;

  return {
    publishedAt: a.publishedAt,
    metadata: contentType === 'job' ? normalizeJobAttributes(a) : normalizeCompanyAttributes(a),
    description: a.description,
  };
}

module.exports = {
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
};
