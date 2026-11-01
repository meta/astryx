// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Splitting test files across legs by recorded time.
 * @input Items (file paths), recorded seconds per item, a leg count.
 * @output Each item's cost, legs that together hold every item exactly once,
 *   and slowest-first order.
 * @position The Node leg sequencer (scripts/vitest-shard-sequencer.mjs) splits
 *   by it; the accessibility contract legs (.github/scripts/a11y-contract-shard.mjs),
 *   which split single tests, share its median for a test with no recorded
 *   time. The numbers only steer balance; which items run never depends on
 *   them.
 */

/** The median of recorded times, or 1 when there are none. */
export function medianOf(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 1;
}

/**
 * Seconds per item: its recorded time, a recorded 0 included, or the median of
 * the recorded times of `items` when it has none (1 when none are recorded).
 * @param {string[]} items
 * @param {Record<string, number>} seconds
 * @returns {(item: string) => number}
 */
export function costOf(items, seconds) {
  const has = item =>
    Object.hasOwn(seconds, item) && Number.isFinite(seconds[item]);
  const median = medianOf(items.filter(has).map(item => seconds[item]));
  return item => (has(item) ? seconds[item] : median);
}

/** Slowest first, ties by path: the same order whatever order items came in. */
export function slowestFirst(items, cost) {
  return [...items].sort((a, b) => cost(b) - cost(a) || a.localeCompare(b));
}

/** Throws unless `legs` together hold every item of `items` exactly once. */
export function assertEachOnce(items, legs, what = 'item') {
  const placed = legs.flat();
  const unique = new Set(items);
  if (placed.length !== unique.size || new Set(placed).size !== unique.size)
    throw new Error(`The leg split lost or repeated a ${what}.`);
  for (const item of placed)
    if (!unique.has(item))
      throw new Error(`The leg split added a ${what}: ${item}.`);
}

/**
 * Splits items into `count` legs, slowest first, each to the leg with the
 * least time so far.
 * @returns {string[][]} each leg's items, sorted; together exactly `items`
 */
export function splitByDuration(items, count, cost) {
  const legs = Array.from({length: count}, () => ({items: [], total: 0}));
  for (const item of slowestFirst(new Set(items), cost)) {
    const leg = legs.reduce((best, next) =>
      next.total < best.total ? next : best,
    );
    leg.items.push(item);
    leg.total += cost(item);
  }
  const result = legs.map(leg => leg.items.sort());
  assertEachOnce(items, result, 'file');
  return result;
}
