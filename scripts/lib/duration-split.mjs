// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Splitting test files across legs by recorded time.
 * @input Items (file paths), recorded seconds per item, a leg count.
 * @output Each item's cost, legs that together hold every item exactly once,
 *   and slowest-first order.
 * @position The Node leg sequencer (scripts/vitest-shard-sequencer.mjs) and
 *   the Node leg planner (scripts/vitest-node-legs.mjs) split by it; the
 *   accessibility contract legs (.github/scripts/a11y-contract-shard.mjs),
 *   which split single tests, share its median for a test with no recorded
 *   time. The numbers only steer balance; which items run never depends on
 *   them. `mergeRecord` refreshes a durations record after a run, for the
 *   sequencer's record and the minimum-Node legs'
 *   (.github/scripts/cli-minimum-node.mjs). No imports, so a sparse checkout
 *   can load it.
 */

/** The median of recorded times, or 1 when there are none. */
export function medianOf(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 1;
}

/**
 * The value that a fraction `p` of `values` stay within (nearest rank), or 1
 * when there are none.
 */
export function percentileOf(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 1;
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}

/**
 * Seconds per item: its recorded time, a recorded 0 included, or, when it has
 * none, `estimate` of the recorded times of `items` (the median by default;
 * 1 when none are recorded).
 * @param {string[]} items
 * @param {Record<string, number>} seconds
 * @param {{estimate?: (recorded: number[]) => number}} [options]
 * @returns {(item: string) => number}
 */
export function costOf(items, seconds, {estimate = medianOf} = {}) {
  const has = item =>
    Object.hasOwn(seconds, item) && Number.isFinite(seconds[item]);
  const recorded = items.filter(has).map(item => seconds[item]);
  const unrecorded = recorded.length > 0 ? estimate(recorded) : 1;
  return item => (has(item) ? seconds[item] : unrecorded);
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
 * Which items share one leg of their own (`together`), which items each take
 * a leg of their own (`alone`), which other items may join the `together`
 * leg (`besideTogether`; every item when it is not given), and which may join
 * an `alone` item's leg (`besideAlone`; as `besideTogether` when not given).
 * @typedef {{together?: (item: string) => boolean, alone?: (item: string) => boolean, besideTogether?: (item: string) => boolean, besideAlone?: (item: string) => boolean}} KeptApart
 */

/**
 * Splits items into `count` legs, slowest first, each to the leg with the
 * least time so far. `reserved[i]` starts leg i with that much time already
 * taken, for work the leg does besides these items. With `apart.together`,
 * those items go to the last leg, and only items `apart.besideTogether`
 * accepts join them there. With `apart.alone`, each of those items takes a
 * leg of its own before the last, with only the items `apart.besideAlone`
 * accepts beside it, when a leg is still left for the other items; with
 * fewer legs it goes where a `together` item goes. When the items
 * `apart.besideAlone` accepts run out before they fill that leg, the items
 * `apart.besideTogether` accepts join it instead. With one leg, or none of those items, the split is
 * as without it.
 * @param {string[]} items
 * @param {number} count
 * @param {(item: string) => number} cost
 * @param {number[]} [reserved]
 * @param {KeptApart} [apart]
 * @returns {string[][]} each leg's items, sorted; together exactly `items`
 */
export function splitByDuration(items, count, cost, reserved = [], apart = {}) {
  const legs = Array.from({length: count}, (_, i) => ({
    items: [],
    total: reserved[i] ?? 0,
  }));
  const unique = [...new Set(items)];
  const lone = apart.alone && count > 1 ? unique.filter(apart.alone) : [];
  const keptOnly =
    apart.together && count > 1
      ? unique.filter(item => apart.together(item) && !lone.includes(item))
      : [];
  // Each lone item takes a leg before the last only while one leg is left
  // for the items no rule keeps apart.
  const ownLegs =
    count - (keptOnly.length > 0 ? 1 : 0) - lone.length >= 1 ? lone : [];
  const kept = [...keptOnly, ...lone.filter(item => !ownLegs.includes(item))];
  const keptLeg = kept.length > 0 ? legs[count - 1] : null;
  const besideKept = apart.besideTogether ?? (() => true);
  const besideLone = apart.besideAlone ?? besideKept;
  for (const item of slowestFirst(kept, cost)) {
    keptLeg.items.push(item);
    keptLeg.total += cost(item);
  }
  const loneLegs = new Set();
  for (const [i, item] of slowestFirst(ownLegs, cost).entries()) {
    const leg = legs[count - (keptLeg ? 2 : 1) - i];
    leg.items.push(item);
    leg.total += cost(item);
    loneLegs.add(leg);
  }
  const keptSet = new Set([...kept, ...ownLegs]);
  const rest = unique.filter(item => !keptSet.has(item));
  for (const item of slowestFirst(rest, cost)) {
    const open = legs.filter(leg =>
      leg === keptLeg
        ? besideKept(item)
        : loneLegs.has(leg)
          ? besideLone(item)
          : true,
    );
    const leg = open.reduce((best, next) =>
      next.total < best.total ? next : best,
    );
    leg.items.push(item);
    leg.total += cost(item);
  }
  // The items `besideAlone` accepts must fill each lone leg: greedy placement
  // leaves a leg that never ran out of items within one of its items of the
  // shortest open leg. When they run out first, the lone leg would hold every
  // one of them, so the split falls back to `besideTogether` for it.
  if (apart.besideAlone && loneLegs.size > 0) {
    const open = legs.filter(leg => leg !== keptLeg && !loneLegs.has(leg));
    const shortest = Math.min(...open.map(leg => leg.total));
    const short = [...loneLegs].some(leg => {
      const company = leg.items.filter(item => !ownLegs.includes(item));
      const step = Math.max(0, ...company.map(cost));
      return open.length > 0 && leg.total + step < shortest;
    });
    if (short)
      return splitByDuration(items, count, cost, reserved, {
        ...apart,
        besideAlone: undefined,
      });
  }
  const result = legs.map(leg => leg.items.sort());
  assertEachOnce(items, result, 'file');
  return result;
}

/**
 * Legs that each hold at most `budget` seconds: from `start` legs, one more at
 * a time while a leg is over, up to `maxLegs`. An item longer than the budget
 * runs in a leg of its own and does not raise the other legs' limit. When
 * those legs, and one more for the rest, would pass `maxLegs`, the items split
 * into `maxLegs` legs by time instead, so there are never more than `maxLegs`.
 * At `maxLegs` with a leg still over the budget, an even split of every item
 * into `maxLegs` legs is kept when its longest leg is shorter.
 * @param {string[]} items
 * @param {(item: string) => number} cost
 * @param {{budget: number, maxLegs?: number, start?: number} & KeptApart} limits
 *   `together`, `alone`, `besideTogether` and `besideAlone` keep items apart
 *   in each split, as splitByDuration does
 * @returns {{count: number, shares: string[][], longest: number}} `longest`
 *   in seconds
 */
export function fitLegsToBudget(
  items,
  cost,
  {
    budget,
    maxLegs,
    start = 1,
    together,
    alone: ownLeg,
    besideTogether,
    besideAlone,
  },
) {
  const apart = {together, alone: ownLeg, besideTogether, besideAlone};
  const unique = [...new Set(items)];
  const total = leg => leg.reduce((sum, item) => sum + cost(item), 0);
  const alone = unique.filter(item => cost(item) > budget).sort();
  const rest = unique.filter(item => cost(item) <= budget);
  if (maxLegs != null && alone.length + (rest.length > 0 ? 1 : 0) > maxLegs) {
    const shares = splitByDuration(unique, maxLegs, cost, [], apart).filter(
      leg => leg.length > 0,
    );
    return {
      count: shares.length,
      shares,
      longest: Math.max(0, ...shares.map(total)),
    };
  }
  let shared = [];
  if (rest.length > 0) {
    const most =
      maxLegs == null
        ? rest.length
        : Math.max(1, Math.min(maxLegs - alone.length, rest.length));
    let count = Math.min(
      Math.max(1, start - alone.length, Math.ceil(total(rest) / budget)),
      most,
    );
    shared = splitByDuration(rest, count, cost, [], apart);
    while (shared.some(leg => total(leg) > budget) && count < most) {
      count += 1;
      shared = splitByDuration(rest, count, cost, [], apart);
    }
  }
  let shares = [
    ...alone.map(item => [item]),
    ...shared.filter(leg => leg.length > 0),
  ];
  const longestOf = legs => Math.max(0, ...legs.map(total));
  if (
    maxLegs != null &&
    shares.length >= maxLegs &&
    longestOf(shares) > budget
  ) {
    const even = splitByDuration(unique, maxLegs, cost, [], apart).filter(
      leg => leg.length > 0,
    );
    if (longestOf(even) < longestOf(shares)) shares = even;
  }
  assertEachOnce(unique, shares);
  return {count: shares.length, shares, longest: longestOf(shares)};
}

/** A swizzle-proof slice file. */
export const SWIZZLE_PROOF = /(^|\/)swizzle-proof\.\d+\.test\.mjs$/;

/**
 * The record after a run. The run's times replace those files' times; files
 * the run did not reach keep their earlier times; a swizzle-proof slice keeps
 * the largest time seen; a file `exists` no longer finds leaves the record.
 * The files are sorted by `compare` (by default `localeCompare`).
 * @param {Record<string, number>} current
 * @param {Record<string, number>} recorded
 * @param {(file: string) => boolean} exists
 * @param {{compare?: (a: string, b: string) => number}} [options]
 * @returns {Record<string, number>}
 */
export function mergeRecord(
  current,
  recorded,
  exists,
  {compare = (a, b) => a.localeCompare(b)} = {},
) {
  const merged = {...current};
  for (const [file, seconds] of Object.entries(recorded)) {
    merged[file] =
      SWIZZLE_PROOF.test(file) && typeof current[file] === 'number'
        ? Math.max(current[file], seconds)
        : seconds;
  }
  return Object.fromEntries(
    Object.entries(merged)
      .filter(([file]) => exists(file))
      .sort(([a], [b]) => compare(a, b)),
  );
}
