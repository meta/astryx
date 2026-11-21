// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file measuredListWindow.ts
 * @input Item sizes, measured or estimated, and scroll positions in the
 *   list's own coordinates
 * @output Item start offsets, the mounted range with overscan in CSS px, row
 *   and gap segments, and the anchor offset that reveals an item; the item at
 *   a position and the anchor that survives a key change come from listWindow
 * @position Pure block-axis math of the private list-windowing module for
 *   items that report their own size. `useMeasuredListWindow` drives it.
 */
import {
  calculateVariableListRange,
  createListWindowSegments,
  type ListWindowSegment,
} from './listWindow';

/** Where a revealed item rests in the scrollport. */
export type MeasuredRevealAlign = 'start' | 'center' | 'end';

/** The start of each item, then the total extent: one more entry than items. */
export function buildItemOffsets(
  count: number,
  sizeAt: (index: number) => number,
): number[] {
  const offsets = new Array<number>(count + 1);
  offsets[0] = 0;
  for (let index = 0; index < count; index++) {
    offsets[index + 1] = offsets[index] + Math.max(0, sizeAt(index));
  }
  return offsets;
}

export interface MeasuredRangeOptions {
  offsets: ReadonlyArray<number>;
  /** The scrollport's top in the list's coordinates: 0 is the first item's start. */
  scrollOffset: number;
  viewportSize: number;
  /** CSS px of items kept mounted above the scrollport. */
  overscanBefore: number;
  /** CSS px of items kept mounted below the scrollport. */
  overscanAfter: number;
}

/** The half-open range of items that cover the scrollport and its overscan. */
export function calculateMeasuredRange({
  offsets,
  scrollOffset,
  viewportSize,
  overscanBefore,
  overscanAfter,
}: MeasuredRangeOptions): {start: number; end: number} {
  const {start, end} = calculateVariableListRange({
    offsets,
    viewportSize: Math.max(0, viewportSize) + overscanBefore + overscanAfter,
    scrollOffset: scrollOffset - overscanBefore,
    isMeasured: true,
    overscan: 0,
  });
  return {start, end};
}

/**
 * Mounted rows and the gaps that stand for the other items, with a retained
 * focused item and, when `isLastRetained`, the last item.
 */
export function createMeasuredSegments(
  offsets: ReadonlyArray<number>,
  start: number,
  end: number,
  focusIndex: number | undefined,
  isLastRetained = false,
): ListWindowSegment[] {
  const count = Math.max(0, offsets.length - 1);
  // The last item joins the window as the end of an interval of its own.
  const segments = createListWindowSegments(count, 1, start, end, focusIndex);
  const last = segments.at(-1);
  if (isLastRetained && last?.type === 'gap' && last.end - last.start > 0) {
    segments.splice(
      -1,
      1,
      ...(last.end - last.start > 1 ? [{...last, end: last.end - 1}] : []),
      {type: 'rows', start: count - 1, end: count},
    );
  }
  return segments.map(segment =>
    segment.type === 'gap'
      ? {...segment, height: offsets[segment.end] - offsets[segment.start]}
      : segment,
  );
}

/** The distance from the scrollport's top to an item's top at `align`. */
export function revealOffset(
  align: MeasuredRevealAlign,
  itemSize: number,
  viewportSize: number,
): number {
  if (align === 'start') {
    return 0;
  }
  const room = viewportSize - itemSize;
  return align === 'end' ? room : room / 2;
}
