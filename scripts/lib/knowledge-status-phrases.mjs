// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Find temporary project status in spec and architecture records.
 * @input A record's Markdown text, or a repository path
 * @output Build-status and sequencing phrases by line; `pnpm check:knowledge`
 *         prints them as warnings and never fails on them
 * @position Advisory record-writing check beside scripts/check-knowledge.mjs
 */

/**
 * Phrases that state build status or work order, including every example
 * INV32 lists. Case-insensitive, whole words.
 */
export const STATUS_PHRASES = [
  'has not started',
  'have not started',
  'no code yet',
  'no code exists',
  'no module exists',
  'not built',
  'not yet built',
  'not implemented yet',
  'not yet implemented',
  'follow-up work',
  'first consumer',
  'second consumer',
  'third consumer',
  'first adopter',
  'adoption order',
  'adopts first',
  'adopts it first',
  'lands before',
  'phase 1',
];

/**
 * A record may carry one status line: a `Status:` line, or a line that is only
 * an in-progress statement. An in-progress phrase inside a longer sentence,
 * such as "a drag in progress", is not a status line.
 */
const STANDALONE_IN_PROGRESS = [
  /^(?:[\w-]+\s+){0,4}(?:is|are|remains|stays)\s+(?:[\w-]+\s+)?in\s+progress$/i,
  /^(?:[\w-]+\s+){0,4}work\s+in\s+progress$/i,
  /^(?:still\s+)?in\s+progress$/i,
];

/**
 * Behavior that shares words with a status phrase. Text that matches one of
 * these is not read for status phrases.
 */
export const BEHAVIOR_CONTEXTS = [
  /\bnot\s+built\s+ahead\s+of\s+time\b/gi,
  /\btarget\s+not\s+built\b/gi,
  /\blands\s+before\s+the\s+next\s+frame\b/gi,
  /\bfix\s+lands\s+before\b/gi,
];

/** Record roots the check reads. */
export const CHECKED_ROOTS = ['docs/specs/', 'docs/architecture/'];

/** Paths the check never reads: a plan orders work by design. */
export const EXCLUDED_PATHS = [/^docs\/specs\/[^/]+\/plan\.md$/];

const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordPattern = phrase =>
  new RegExp(
    `(?<![\\w-])${escape(phrase).replace(/ /g, '\\s+')}(?![\\w-])`,
    'gi',
  );
const STATUS_PATTERNS = STATUS_PHRASES.map(p => [p, wordPattern(p)]);
const STATUS_LINE = /^\s*(?:[-*]\s+)?(?:\*\*|__)?Status(?:\*\*|__)?\s*:/i;
const IN_PROGRESS = wordPattern('in progress');

export function isStatusCheckedPath(filePath) {
  return (
    CHECKED_ROOTS.some(root => filePath.startsWith(root)) &&
    filePath.endsWith('.md') &&
    !EXCLUDED_PATHS.some(pattern => pattern.test(filePath))
  );
}

/** The same text with each match blanked out, line breaks kept. */
const blank = match => match.replace(/[^\n]/g, ' ');

/**
 * A paragraph's lines with code spans and quoted text removed. A span or a
 * quote may wrap across lines; it never crosses a blank line.
 */
function proseLines(paragraph) {
  let text = paragraph
    .join('\n')
    .replace(/(`+)[\s\S]*?\1/g, blank)
    .replace(/"[^"]*"/g, blank)
    .replace(/“[^”]*”/g, blank);
  for (const context of BEHAVIOR_CONTEXTS) text = text.replace(context, blank);
  return text.split('\n');
}

function matches(text, patterns) {
  const hits = new Set();
  for (const [phrase, pattern] of patterns) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) hits.add(phrase);
  }
  return [...hits];
}

function isStandaloneInProgress(text) {
  const core = text
    .replace(/^\s*(?:[-*]\s+)?/, '')
    .replace(/(?:\*\*|__|\*|_)/g, '')
    .replace(/[.!]\s*$/, '')
    .trim();
  return STANDALONE_IN_PROGRESS.some(pattern => pattern.test(core));
}

/**
 * Status phrases in a record body, one entry per phrase and line.
 * @param {string} content
 * @returns {Array<{line: number, phrase: string, text: string}>}
 */
export function findStatusPhrases(content) {
  const lines = String(content ?? '').split(/\r?\n/);
  let start = 0;
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end > 0) start = end + 1;
  }

  // Prose paragraphs: runs of lines outside fences, block quotes, and headings.
  const prose = new Map();
  let paragraph = [];
  let paragraphStart = 0;
  const flush = () => {
    if (!paragraph.length) return;
    proseLines(paragraph).forEach((text, offset) =>
      prose.set(paragraphStart + offset, text),
    );
    paragraph = [];
  };
  let fence = null;
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    const fenceMark = line.match(/^\s*(`{3,}|~{3,})/);
    if (fenceMark) {
      flush();
      if (!fence) fence = fenceMark[1][0];
      else if (fenceMark[1][0] === fence) fence = null;
      continue;
    }
    if (
      fence ||
      /^\s*>/.test(line) ||
      /^#{1,6}\s/.test(line) ||
      line.trim() === ''
    ) {
      flush();
      continue;
    }
    if (!paragraph.length) paragraphStart = i;
    paragraph.push(line);
  }
  flush();

  const hits = [];
  let statusLineSeen = false;
  for (const [i, text] of [...prose].sort(([a], [b]) => a - b)) {
    const found = matches(text, STATUS_PATTERNS);
    if (STATUS_LINE.test(text) || isStandaloneInProgress(text)) {
      if (statusLineSeen && IN_PROGRESS.test(text)) found.push('in progress');
      IN_PROGRESS.lastIndex = 0;
      statusLineSeen = true;
    }
    for (const phrase of found)
      hits.push({line: i + 1, phrase, text: lines[i].trim()});
  }
  return hits;
}
