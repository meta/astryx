// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file inlineDiff.ts
 * @input Two lines of text: a removed line and the added line that replaced it
 * @output Exports diffInlineRanges and InlineRange: the changed character
 *   ranges on each side, for word- or character-level highlighting
 * @position Lab helper used by DiffViewer's inline change highlighting
 *
 * Finds the longest common subsequence of the two lines' tokens (words,
 * whitespace runs and single punctuation characters, or single characters)
 * and reports what falls outside it on each side. Pure and synchronous.
 *
 * SYNC: When modified, update:
 * - /packages/lab/src/DiffViewer/inlineDiff.test.ts
 * - /packages/lab/src/DiffViewer/DiffViewer.tsx (the caller)
 */

/** Half-open `[start, end)` character range within one line. */
export type InlineRange = readonly [start: number, end: number];

/** How finely to compare a pair of lines. */
export type InlineDiffGranularity = 'word' | 'char';

export interface InlineDiffResult {
  /** Changed ranges in the removed (old) line. */
  old: InlineRange[];
  /** Changed ranges in the added (new) line. */
  new: InlineRange[];
}

/**
 * Upper bound on the comparison table (tokens × tokens). Beyond it a pair is
 * reported as having no inline ranges, so a very long minified line cannot
 * stall rendering; its row tint still marks it as changed.
 */
const MAX_CELLS = 250_000;

const EMPTY: InlineDiffResult = {old: [], new: []};

interface Piece {
  text: string;
  start: number;
  end: number;
}

const WORD_PATTERN = /\w+|\s+|[^\w\s]/gu;

function split(line: string, granularity: InlineDiffGranularity): Piece[] {
  if (granularity === 'char') {
    // Code points, with UTF-16 offsets so ranges index the string directly.
    let offset = 0;
    return Array.from(line, text => {
      const start = offset;
      offset += text.length;
      return {text, start, end: offset};
    });
  }
  const pieces: Piece[] = [];
  for (const match of line.matchAll(WORD_PATTERN)) {
    const start = match.index ?? 0;
    pieces.push({text: match[0], start, end: start + match[0].length});
  }
  return pieces;
}

function isBlank(text: string): boolean {
  return text.trim() === '';
}

/**
 * Merge the changed pieces into ranges: adjacent pieces join, and in word
 * mode so do two changes separated only by whitespace, so `a b` → `c d`
 * reads as one change rather than two with a gap. Ranges of only whitespace
 * (re-indentation) are dropped: a highlighted blank says little.
 */
function toRanges(
  pieces: Piece[],
  changed: boolean[],
  granularity: InlineDiffGranularity,
): InlineRange[] {
  const ranges: Array<[number, number]> = [];
  let i = 0;
  while (i < pieces.length) {
    if (!changed[i]) {
      i++;
      continue;
    }
    const start = pieces[i].start;
    let end = pieces[i].end;
    i++;
    while (i < pieces.length) {
      if (changed[i]) {
        end = pieces[i].end;
        i++;
        continue;
      }
      // Bridge one unchanged whitespace run between two changes.
      if (
        granularity === 'word' &&
        isBlank(pieces[i].text) &&
        i + 1 < pieces.length &&
        changed[i + 1]
      ) {
        end = pieces[i + 1].end;
        i += 2;
        continue;
      }
      break;
    }
    if (
      pieces.some(p => p.start >= start && p.end <= end && !isBlank(p.text))
    ) {
      ranges.push([start, end]);
    }
  }
  return ranges;
}

/**
 * Below this share of the shorter line's non-whitespace characters in
 * common, two paired lines are treated as unrelated: highlighting most of
 * both would say no more than the row tint.
 */
const MIN_SHARED_RATIO = 0.5;

function contentLength(pieces: Piece[]): number {
  let length = 0;
  for (const piece of pieces) {
    if (!isBlank(piece.text)) {
      length += piece.text.length;
    }
  }
  return length;
}

/**
 * The changed ranges of a removed line and the added line that replaced it.
 * Returns no ranges when the lines are mostly different (less than half of
 * the shorter line's non-whitespace text in common: the whole line changed,
 * which the row tint already says) or when they are too long to compare.
 */
export function diffInlineRanges(
  oldLine: string,
  newLine: string,
  granularity: InlineDiffGranularity,
): InlineDiffResult {
  if (oldLine === newLine) {
    return EMPTY;
  }
  const a = split(oldLine, granularity);
  const b = split(newLine, granularity);
  const n = a.length;
  const m = b.length;
  if (n === 0 || m === 0 || n * m > MAX_CELLS) {
    return EMPTY;
  }

  // lengths[i * (m + 1) + j] = LCS length of a[i..] and b[j..].
  const width = m + 1;
  const lengths = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lengths[i * width + j] =
        a[i].text === b[j].text
          ? lengths[(i + 1) * width + j + 1] + 1
          : Math.max(lengths[(i + 1) * width + j], lengths[i * width + j + 1]);
    }
  }

  const oldChanged = new Array<boolean>(n).fill(true);
  const newChanged = new Array<boolean>(m).fill(true);
  let shared = 0;
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i].text === b[j].text) {
      oldChanged[i] = false;
      newChanged[j] = false;
      if (!isBlank(a[i].text)) {
        shared += a[i].text.length;
      }
      i++;
      j++;
    } else if (lengths[(i + 1) * width + j] >= lengths[i * width + j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  const shorter = Math.min(contentLength(a), contentLength(b));
  if (shared === 0 || shared < shorter * MIN_SHARED_RATIO) {
    return EMPTY;
  }
  return {
    old: toRanges(a, oldChanged, granularity),
    new: toRanges(b, newChanged, granularity),
  };
}
