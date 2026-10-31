// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Render report-file strings as display text in the PR comment.
 *
 * The comment's structure — headings, tables, <details>, links — is built
 * from literals in the generator; strings that arrive via report files
 * (analysis.json, a11y-report.json, verdict.json) are display data and should
 * render exactly as written, not as markup. `inline()` keeps such a value on
 * one line with markdown and HTML characters rendered literally, `num()`
 * keeps a numeric field numeric, and `safeUrl()` admits only plain absolute
 * http(s) URLs for the few report fields that become link targets.
 */

/** One line of literal text: no HTML tags, no markdown structure. */
function inline(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\s*[\r\n]+\s*/g, ' ')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/[|[\]`*_~]/g, ch => `\\${ch}`);
}

/** A finite number, or the fallback. */
function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * A URL that is safe as a markdown link target or href attribute: absolute
 * http(s), no whitespace, quotes, angle brackets, parens, or backslashes.
 * Returns null (drop the link, keep the text) for anything else.
 */
function safeUrl(value) {
  const url = String(value ?? '').trim();
  return /^https?:\/\/[^\s<>"'()\\]+$/.test(url) ? url : null;
}

/**
 * A measured byte count as text (`900B`, `1.5KB`, `2.25MB`), or N/A. Shared by
 * every size the PR report shows.
 */
function sizeText(bytes) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes)) return 'N/A';
  if (Math.abs(bytes) < 1024) return `${bytes}B`;
  if (Math.abs(bytes) < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

module.exports = {inline, num, safeUrl, sizeText};
