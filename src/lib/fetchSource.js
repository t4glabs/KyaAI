const { htmlToText } = require('html-to-text');

const URL_ONLY_RE = /^\s*https?:\/\/\S+\s*$/i;

function isBareUrl(input) {
  return URL_ONLY_RE.test(input);
}

/**
 * If the operator pasted a bare URL instead of raw text, fetch the page and
 * convert it to plain text so Claude gets clean content instead of raw HTML
 * (nav bars, scripts, etc. stripped out).
 */
async function resolveSourceText(input) {
  const trimmed = input.trim();
  if (!isBareUrl(trimmed)) {
    return trimmed;
  }

  const response = await fetch(trimmed, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; aikyam-job-composer/0.1)' },
  });

  if (!response.ok) {
    throw new Error(`Could not fetch ${trimmed}: HTTP ${response.status}`);
  }

  const html = await response.text();
  const text = htmlToText(html, {
    wordwrap: false,
    selectors: [
      { selector: 'script', format: 'skip' },
      { selector: 'style', format: 'skip' },
      { selector: 'nav', format: 'skip' },
      { selector: 'footer', format: 'skip' },
      { selector: 'a', options: { ignoreHref: true } },
    ],
  });

  return `Source URL: ${trimmed}\n\n${text}`;
}

module.exports = { resolveSourceText, isBareUrl };
