// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file itemSizes.ts
 * @input An item count and either one fixed size or an estimate plus the
 *   sizes measured so far
 * @output Item offsets, sizes and the item at an offset, in CSS pixels
 * @position The list-windowing module's offset model. The windowing math reads
 *   only this interface, so the model can change without touching it.
 */

export interface ListItemSizes {
  readonly count: number;
  /** The extent of all items together. */
  readonly total: number;
  /** Where item `index` starts; `offsetOf(count)` is the total. */
  offsetOf: (index: number) => number;
  sizeOf: (index: number) => number;
  /** The item whose span holds `offset`, clamped to the list. */
  indexAt: (offset: number) => number;
}

/** Every item has one exact size. */
export function fixedItemSizes(count: number, size: number): ListItemSizes {
  const last = Math.max(0, count - 1);
  return {
    count,
    total: count * size,
    offsetOf: index => index * size,
    sizeOf: () => size,
    indexAt: offset => Math.min(last, Math.max(0, Math.floor(offset / size))),
  };
}

/**
 * Items take their measured size, and an item not yet measured takes the
 * estimate. Offsets are prefix sums, so a lookup is a binary search.
 */
export function measuredItemSizes(
  count: number,
  estimate: number,
  measured: ReadonlyMap<number, number>,
): ListItemSizes {
  const starts = new Float64Array(count + 1);
  for (let index = 0; index < count; index++) {
    starts[index + 1] = starts[index] + (measured.get(index) ?? estimate);
  }
  const last = Math.max(0, count - 1);
  return {
    count,
    total: starts[count],
    offsetOf: index => starts[Math.min(count, Math.max(0, index))],
    sizeOf: index => starts[index + 1] - starts[index],
    indexAt: offset => {
      if (offset <= 0) {
        return 0;
      }
      let low = 0;
      let high = last;
      while (low < high) {
        const middle = (low + high + 1) >> 1;
        if (starts[middle] <= offset) {
          low = middle;
        } else {
          high = middle - 1;
        }
      }
      return low;
    },
  };
}
