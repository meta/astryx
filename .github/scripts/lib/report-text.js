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
  if (Math.abs(bytes) < 1024) return `${bytes} B`;
  if (Math.abs(bytes) < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * GitHub refuses a comment over 65,536 characters, and the PR report then
 * posts nothing at all. The report stays under this budget, leaving room for
 * the markers and footer added around it.
 */
const COMMENT_BUDGET = 60000;

/**
 * Markdown cut at a line boundary to fit `budget` characters: it closes any
 * disclosure left open, ends a table it cut, and says how many lines did not
 * fit. Markdown within the budget is returned unchanged.
 */
function fitToBudget(markdown, budget) {
  const text = String(markdown ?? '');
  if (text.length <= budget) return text;
  const lines = text.split('\n');
  // Room for the closing tags and the note.
  const reserve = 400;
  const kept = [];
  let size = 0;
  for (const line of lines) {
    if (size + line.length + 1 > budget - reserve) break;
    kept.push(line);
    size += line.length + 1;
  }
  const omitted = lines
    .slice(kept.length)
    .filter(line => line.trim() !== '').length;
  const keptText = kept.join('\n');
  const open =
    (keptText.match(/<details[\s>]/g) || []).length -
    (keptText.match(/<\/details>/g) || []).length;
  const tail = [
    ...(kept.at(-1)?.startsWith('|') ? [''] : []),
    `_${num(omitted).toLocaleString('en-US')} more line${omitted === 1 ? '' : 's'} did not fit GitHub's comment limit; the run's full report has them._`,
    '',
    ...Array.from({length: Math.max(0, open)}, () => '</details>\n'),
  ];
  return `${keptText}\n${tail.join('\n')}\n`;
}

module.exports = {COMMENT_BUDGET, fitToBudget, inline, num, safeUrl, sizeText};
