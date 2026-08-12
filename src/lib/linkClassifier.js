// Pure hostname/path pattern matching — no network calls. Lets the link-check
// list show what kind of link each one is without opening it, so patterns
// like "bit.ly links are usually a checker false positive, not a dead link"
// become visible at a glance across many rows.
const HOST_PATTERNS = [
  [/(^|\.)bit\.ly$/i, 'Bit.ly (shortened)'],
  [/(^|\.)tinyurl\.com$/i, 'TinyURL (shortened)'],
  [/(^|\.)rebrand\.ly$/i, 'Rebrandly (shortened)'],
  [/(^|\.)lnkd\.in$/i, 'LinkedIn (shortened)'],
  [/(^|\.)forms\.gle$/i, 'Google Form'],
  [/(^|\.)zohorecruit\.\w+$/i, 'Zoho Recruit'],
  [/(^|\.)greenhouse\.io$/i, 'Greenhouse'],
  [/(^|\.)myworkdayjobs\.com$/i, 'Workday'],
  [/(^|\.)icims\.com$/i, 'iCIMS'],
  [/(^|\.)lever\.co$/i, 'Lever'],
  [/(^|\.)typeform\.com$/i, 'Typeform'],
  [/(^|\.)tally\.so$/i, 'Tally Form'],
  [/(^|\.)linkedin\.com$/i, 'LinkedIn'],
  [/(^|\.)naukri\.com$/i, 'Naukri'],
  [/(^|\.)indeed\.com$/i, 'Indeed'],
];

/**
 * Classifies an application URL by hostname/path so the link-check list can
 * show a tag like "Google Form" or "Bit.ly (shortened)" without following
 * the link. Returns null for an empty/unparseable URL.
 */
function classifyLink(url) {
  if (!url) return null;

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { label: 'Unrecognized URL', host: url };
  }

  const host = parsed.hostname.replace(/^www\./i, '');

  if (host === 'docs.google.com' && parsed.pathname.startsWith('/forms/')) {
    return { label: 'Google Form', host };
  }

  for (const [pattern, label] of HOST_PATTERNS) {
    if (pattern.test(host)) {
      return { label, host };
    }
  }

  return { label: 'Organization website', host };
}

module.exports = { classifyLink };
