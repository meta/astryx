// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file pagerIndex.ts
 * @input A page index, a reference index and a page count
 * @output `mod` and `nearestLoopCopy`: the index arithmetic of a looping pager
 * @position Shared by the pager and the date and time wheels. It holds no
 *   motion or gesture code, so a wheel that reads it statically does not pull
 *   in the deferred touch runtime
 */

export function mod(value: number, count: number): number {
  return ((value % count) + count) % count;
}

/**
 * The copy of page `index` nearest virtual page `from`, in a loop of `count`
 * pages. Two copies can be equally near: with two pages, or half an even
 * count away. Then it is `index` itself when that is one of them, so a step
 * to `from + 1` always goes forward.
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
