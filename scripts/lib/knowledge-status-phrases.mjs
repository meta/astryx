// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Find temporary project status in spec and architecture records.
 * @input A record's Markdown text, or a repository path
 * @output Build-status and sequencing phrases by line; `pnpm check:knowledge`
 *         prints them as warnings and never fails on them
 * @position Advisory record-writing check beside scripts/check-knowledge.mjs
 */

/** Phrases that state build status or work order. Case-insensitive, whole words. */
export const STATUS_PHRASES = [
  'has not started',
  'have not started',
  'no code yet',
  'no code exists',
  'no module exists',
  'not built yet',
  'not yet built',
  'not implemented yet',
  'not yet implemented',
  'first consumer',
  'second consumer',
  'third consumer',
  'adoption order',
  'adopts first',
];

/**
 * A record may carry one status line: a `Status:` line or one of these. A
 * state of the system, such as "a drag in progress", is not a status line.
 */
export const ALLOWED_ONCE_PATTERNS = [
  [
    'in progress',
    /\b(?:is|are|remains|stays|still|currently)\s+(?:\w+\s+)?in\s+progress\b/i,
  ],
  ['in progress', /\bwork\s+in\s+progress\b/i],
];

/** Record roots the check reads. */
export const CHECKED_ROOTS = ['docs/specs/', 'docs/architecture/'];

/** Paths the check never reads: a plan orders work by design. */
export const EXCLUDED_PATHS = [/^docs\/specs\/[^/]+\/plan\.md$/];

/**
 * Sections that list conformance gaps. A line in one stays silent only when it
 * names a claim and states the mismatch the reader sees.
 */
export const GAP_SECTIONS = [
  'known gaps',
  'known conformance gaps',
  'implementation gap',
  'current-state impact',
];

/** A claim id that a gap line must name. */
const CLAIM_ID = /\b(?:FR|INV)\d+[a-z]?\b/;

/** Words a gap line keeps after its claim ids and phrases go: the mismatch. */
const MISMATCH_MIN_WORDS = 4;

const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordPattern = phrase =>
  new RegExp(
    `(?<![\\w-])${escape(phrase).replace(/ /g, '\\s+')}(?![\\w-])`,
    'gi',
  );
const STATUS_PATTERNS = STATUS_PHRASES.map(p => [p, wordPattern(p)]);
const STATUS_LINE = /^\s*(?:[-*]\s+)?(?:\*\*|__)?Status(?:\*\*|__)?\s*:/i;

export function isStatusCheckedPath(filePath) {
  return (
    CHECKED_ROOTS.some(root => filePath.startsWith(root)) &&
    filePath.endsWith('.md') &&
    !EXCLUDED_PATHS.some(pattern => pattern.test(filePath))
  );
}

/** The line with code spans and quoted text removed. */
function prose(line) {
  return line
    .replace(/(`+)[\s\S]*?\1/g, ' ')
    .replace(/"[^"]*"/g, ' ')
    .replace(/“[^”]*”/g, ' ');
}

function matches(text, patterns) {
  const hits = new Set();
  for (const [phrase, pattern] of patterns) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) hits.add(phrase);
  }
  return [...hits];
}

function statesMismatch(text) {
  if (!CLAIM_ID.test(text)) return false;
  let rest = text.replace(new RegExp(CLAIM_ID.source, 'g'), ' ');
  for (const [, pattern] of STATUS_PATTERNS) rest = rest.replace(pattern, ' ');
  const words = rest.replace(/\bgaps?\b/gi, ' ').match(/[A-Za-z][\w'-]*/g);
  return (words?.length ?? 0) >= MISMATCH_MIN_WORDS;
}

/**
 * Status phrases in a record body, one entry per phrase and line.
 * @param {string} content
 * @returns {Array<{line: number, phrase: string, text: string}>}
 */
export function findStatusPhrases(content) {
  const lines = String(content ?? '').split(/\r?\n/);
  const hits = [];
  let start = 0;
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end > 0) start = end + 1;
  }
  let fence = null;
  let gapLevel = 0;
  let statusLineSeen = false;
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    const fenceMark = line.match(/^\s*(`{3,}|~{3,})/);
    if (fenceMark) {
      if (!fence) fence = fenceMark[1][0];
      else if (fenceMark[1][0] === fence) fence = null;
      continue;
    }
    if (fence || /^\s*>/.test(line)) continue;
    const heading = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (heading) {
      const level = heading[1].length;
      if (gapLevel && level <= gapLevel) gapLevel = 0;
      const title = heading[2].toLowerCase();
      if (GAP_SECTIONS.some(name => title.startsWith(name))) gapLevel = level;
      continue;
    }
    const text = prose(line);
    const allowed =
      STATUS_LINE.test(text) || matches(text, ALLOWED_ONCE_PATTERNS).length > 0;
    let found = matches(text, STATUS_PATTERNS);
    if (allowed) {
      if (!statusLineSeen) {
        statusLineSeen = true;
        continue;
      }
      found = [...found, ...matches(text, ALLOWED_ONCE_PATTERNS)];
    }
    if (!found.length) continue;
    if (gapLevel && statesMismatch(text)) continue;
    for (const phrase of found)
      hits.push({line: i + 1, phrase, text: line.trim()});
  }
  return hits;
}
