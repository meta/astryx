// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file loopIndex.ts
 * @input Indices on a loop of `count` items
 * @output mod and nearestLoopCopy: where an index falls on a loop, and the
 *   copy of an index nearest another
 * @position Shared helper of the looping pager (hooks/usePager.ts) and the
 *   looping picker wheel (DateInput/PickerWheel.tsx)
 *
 * SYNC: When modified, update loopIndex.test.ts.
 */

/** `value` folded onto a loop of `count`: 0 or more, and less than `count`. */
export function mod(value: number, count: number): number {
  return ((value % count) + count) % count;
}

/**
 * The copy of index `index` nearest virtual index `from`, in a loop of `count`
 * items. Two copies can be equally near: with two items, or half an even count
 * away. Then it is `index` itself when that is one of them, so a step to
 * `from + 1` always goes forward.
 */
export function nearestLoopCopy(
  index: number,
  from: number,
  count: number,
): number {
  if (Math.abs(index - from) * 2 <= count) {
    return index;
  }
  return Math.round(
    from +
      (((mod(index, count) - mod(from, count) + count + count / 2) % count) -
        count / 2),
  );
}
