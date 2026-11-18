// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Levenshtein edit distance — pure, dependency-free.
 *
 * Lives apart from string-utils.mjs (which dynamically imports node:fs/path
 * for component search) so browser-bundled code — the XLE/XLO layout
 * language — can use fuzzy matching without dragging node: schemes into the
 * webpack graph.
 *
 * @input  two strings
 * @output edit distance (number)
 * @position lib — shared by string-utils.mjs and lib/xle/validate.mjs
 */

/**
 * @param {string} a
 * @param {string} b
 * @param {number} [max] - The largest distance the caller can use. When
 *   given, a larger distance answers `max + 1`, and only the cells within
 *   `max` of the diagonal are computed.
 * @param {{swaps?: boolean}} [options] - With `swaps` and a `max`, two
 *   adjacent letters swapped cost one edit, not two (the optimal string
 *   alignment distance).
 * @returns {number}
 */
export function levenshteinDistance(a, b, max, {swaps = false} = {}) {
  if (max !== undefined) return distanceWithin(a, b, max, swaps);
  const m = a.length,
    n = b.length;
  // Early exit: the distance is always ≥ |m − n|, so once the length gap
  // exceeds the loosest fuzzy-match threshold any caller uses (the hook
  // suggester keeps distance ≤ 5) the pair can never match — skip the O(m·n)
  // DP entirely. Closes the DoS surface where a long query (>3k chars) caused
  // multi-second CPU spins (8,860 calls × O(n²) per search).
  if (Math.abs(m - n) > 5) return 999;
  /** @type {number[][]} */
  const dp = Array.from({length: m + 1}, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * The edit distance between `a` and `b` when it is at most `max`, or
 * `max + 1` when it is more. A path through a cell more than `max` from the
 * diagonal costs more than `max`, so only that band is computed.
 * @param {string} a
 * @param {string} b
 * @param {number} max
 * @param {boolean} swaps - two adjacent letters swapped cost one edit
 * @returns {number}
 */
function distanceWithin(a, b, max, swaps) {
  const over = max + 1;
  if (Math.abs(a.length - b.length) > max) return over;
  let before = new Array(b.length + 1).fill(over);
  let previous = new Array(b.length + 1).fill(over);
  let current = new Array(b.length + 1).fill(over);
  for (let j = 0; j <= Math.min(b.length, max); j++) previous[j] = j;
  for (let i = 1; i <= a.length; i++) {
    current.fill(over);
    const from = Math.max(1, i - max);
    const to = Math.min(b.length, i + max);
    if (i <= max) current[0] = i;
    let rowMin = current[0];
    for (let j = from; j <= to; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(
        previous[j - 1] + cost,
        previous[j] + 1,
        current[j - 1] + 1,
        over,
      );
      if (
        swaps &&
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        value = Math.min(value, before[j - 2] + 1);
      }
      current[j] = value;
      if (value < rowMin) rowMin = value;
    }
    // Every later cell costs at least this row's least.
    if (rowMin >= over) return over;
    [before, previous, current] = [previous, current, before];
  }
  return Math.min(previous[b.length], over);
}
