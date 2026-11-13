// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file listWindow.ts
 * @input Fixed or per-item CSS-pixel pitch, scroll geometry and canonical row keys
 * @output Half-open ranges, row and gap segments, and first-visible-key reconciliation
 * @position The one private long-list windowing module in Core
 */
export type ListWindowSegment =
  | {type: 'rows'; start: number; end: number}
  | {type: 'gap'; start: number; end: number; height: number};

export interface ListWindowOptions {
  rowCount: number;
  rowHeight: number;
  viewportHeight: number;
  scrollTop: number;
  /** Measured full content extent; does not change the logical row total. */
  scrollHeight?: number;
  /** Distance from the scroll origin to the first row, such as a header. */
  startOffset: number;
  isMeasured: boolean;
  focusIndex?: number;
}

export interface ListWindowPlan {
  segments: ListWindowSegment[];
  start: number;
  end: number;
  firstVisibleIndex: number;
  offset: number;
  totalHeight: number;
}

export function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/** Returns null when the inputs cannot form a finite window. */
export function calculateListWindow(
  options: ListWindowOptions,
): ListWindowPlan | null {
  const {
    rowCount,
    rowHeight,
    viewportHeight,
    scrollTop,
    startOffset,
    isMeasured,
    focusIndex,
  } = options;
  const totalHeight = rowCount * rowHeight;
  if (
    !Number.isSafeInteger(rowCount) ||
    rowCount < 0 ||
    !isPositiveFinite(rowHeight) ||
    !isPositiveFinite(viewportHeight) ||
    !Number.isFinite(totalHeight) ||
    !Number.isFinite(startOffset + totalHeight) ||
    !Number.isFinite(viewportHeight / rowHeight) ||
    !Number.isFinite(scrollTop) ||
    (options.scrollHeight !== undefined &&
      (!Number.isFinite(options.scrollHeight) || options.scrollHeight < 0)) ||
    !Number.isFinite(startOffset) ||
    startOffset < 0
  ) {
    return null;
  }
  if (rowCount === 0) {
    return {
      segments: [],
      start: 0,
      end: 0,
      firstVisibleIndex: 0,
      offset: 0,
      totalHeight: 0,
    };
  }

  // Clamp against the full body extent, not mounted DOM or window-local indices.
  const contentHeight = Math.max(
    startOffset + totalHeight,
    options.scrollHeight ?? 0,
  );
  const maximumScroll = Math.max(0, contentHeight - viewportHeight);
  const clampedScroll = Math.min(maximumScroll, Math.max(0, scrollTop));
  const listTop = clampedScroll - startOffset;
  const bodyTop = Math.min(totalHeight, Math.max(0, listTop));
  const bodyBottom = Math.min(
    totalHeight,
    Math.max(0, clampedScroll + viewportHeight - startOffset),
  );
  const firstVisibleIndex = isMeasured
    ? Math.min(rowCount - 1, Math.floor(bodyTop / rowHeight))
    : 0;
  // Above the first row, the offset is the negative distance to it, so an
  // anchor round-trips a scroll position inside the leading content.
  const offset = !isMeasured
    ? 0
    : listTop < 0
      ? listTop
      : bodyTop - firstVisibleIndex * rowHeight;
  const start = isMeasured ? Math.max(0, firstVisibleIndex - 4) : 0;
  const end = isMeasured
    ? Math.min(
        rowCount,
        Math.max(firstVisibleIndex, Math.ceil(bodyBottom / rowHeight)) + 4,
      )
    : Math.min(rowCount, Math.ceil(viewportHeight / rowHeight) + 4);
  return {
    segments: createListWindowSegments(
      rowCount,
      rowHeight,
      start,
      end,
      focusIndex,
    ),
    start,
    end,
    firstVisibleIndex,
    offset,
    totalHeight,
  };
}

/** Mounted rows and gaps for a range, plus one retained row outside it. */
export function createListWindowSegments(
  rowCount: number,
  rowHeight: number,
  start: number,
  end: number,
  focusIndex?: number,
): ListWindowSegment[] {
  if (rowCount === 0) {
    return [];
  }
  const intervals: {start: number; end: number}[] = [{start, end}];
  if (
    focusIndex !== undefined &&
    Number.isInteger(focusIndex) &&
    focusIndex >= 0 &&
    focusIndex < rowCount &&
    (focusIndex < start || focusIndex >= end)
  ) {
    intervals.push({start: focusIndex, end: focusIndex + 1});
    intervals.sort((a, b) => a.start - b.start);
  }
  const merged: {start: number; end: number}[] = [];
  for (const interval of intervals) {
    const previous = merged[merged.length - 1];
    if (previous && interval.start <= previous.end) {
      previous.end = Math.max(previous.end, interval.end);
    } else if (interval.end > interval.start) {
      merged.push({...interval});
    }
  }
  const segments: ListWindowSegment[] = [];
  let cursor = 0;
  for (const interval of merged) {
    if (interval.start > cursor) {
      segments.push({
        type: 'gap',
        start: cursor,
        end: interval.start,
        height: (interval.start - cursor) * rowHeight,
      });
    }
    segments.push({type: 'rows', ...interval});
    cursor = interval.end;
  }
  if (cursor < rowCount) {
    segments.push({
      type: 'gap',
      start: cursor,
      end: rowCount,
      height: (rowCount - cursor) * rowHeight,
    });
  }
  return segments;
}

export interface VariableListRangeOptions {
  /** The start of each item, then the total extent: one more entry than items. */
  offsets: ReadonlyArray<number>;
  viewportSize: number;
  scrollOffset: number;
  isMeasured: boolean;
  overscan: number;
}

export interface VariableListRange {
  start: number;
  end: number;
  firstVisibleIndex: number;
  /** Distance from the first visible item's start to the scroll offset. */
  offset: number;
}

/**
 * The first index in `[0, limit)` whose offset is at least `value`, or above
 * it when `isStrict` is set.
 */
function lowerBound(
  offsets: ReadonlyArray<number>,
  value: number,
  limit: number,
  isStrict = false,
): number {
  let low = 0;
  let high = limit;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (isStrict ? offsets[middle] <= value : offsets[middle] < value) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

/**
 * The half-open item range for items of varying size. Before measurement it
 * holds the items that start inside the viewport, plus overscan after them.
 */
export function calculateVariableListRange({
  offsets,
  viewportSize,
  scrollOffset,
  isMeasured,
  overscan,
}: VariableListRangeOptions): VariableListRange {
  const count = Math.max(0, offsets.length - 1);
  if (count === 0) {
    return {start: 0, end: 0, firstVisibleIndex: 0, offset: 0};
  }
  if (!isMeasured) {
    return {
      start: 0,
      end: Math.min(count, lowerBound(offsets, viewportSize, count) + overscan),
      firstVisibleIndex: 0,
      offset: 0,
    };
  }
  const total = offsets[count];
  const visibleSize = Math.max(0, viewportSize);
  const scroll = Math.min(
    Math.max(0, total - visibleSize),
    Math.max(0, scrollOffset),
  );
  // The last item that starts at or before the scroll offset.
  const first = Math.max(
    0,
    Math.min(count - 1, lowerBound(offsets, scroll, count, true) - 1),
  );
  const last = Math.max(
    first + 1,
    lowerBound(offsets, scroll + visibleSize, count),
  );
  return {
    start: Math.max(0, first - overscan),
    end: Math.min(count, last + overscan),
    firstVisibleIndex: first,
    offset: scroll - offsets[first],
  };
}

export interface ListAnchorOptions {
  previousKeys: ReadonlyArray<string | number>;
  keys: ReadonlyArray<string | number>;
  firstVisibleIndex: number;
  offset: number;
  rowHeight: number;
  viewportHeight: number;
  startOffset: number;
  /** Existing non-row content extent retained across logical data changes. */
  trailingContentHeight?: number;
  /** Key-to-index map. Build it when the keys change, never on scroll. */
  keyIndices?: ReadonlyMap<string | number, number>;
  /**
   * Item start offsets plus the total extent, for items of varying size. With
   * them, `offset` is a fraction of the anchor item's size, and `rowHeight`
   * is not read.
   */
  offsets?: ReadonlyArray<number>;
}

export function reconcileListAnchor(options: ListAnchorOptions): number {
  const {
    previousKeys,
    keys,
    firstVisibleIndex,
    offset,
    rowHeight,
    viewportHeight,
    startOffset,
  } = options;
  const indices =
    options.keyIndices ?? new Map(keys.map((key, index) => [key, index]));
  let index = indices.get(previousKeys[firstVisibleIndex]);
  if (index === undefined) {
    for (let i = firstVisibleIndex + 1; i < previousKeys.length; i++) {
      index = indices.get(previousKeys[i]);
      if (index !== undefined) {
        break;
      }
    }
  }
  if (index === undefined) {
    for (
      let i = Math.min(firstVisibleIndex - 1, previousKeys.length - 1);
      i >= 0;
      i--
    ) {
      index = indices.get(previousKeys[i]);
      if (index !== undefined) {
        break;
      }
    }
  }
  const {offsets} = options;
  const maximumScroll = Math.max(
    0,
    startOffset +
      (offsets ? (offsets[keys.length] ?? 0) : keys.length * rowHeight) +
      (options.trailingContentHeight ?? 0) -
      viewportHeight,
  );
  if (offsets) {
    const itemStart = offsets[index ?? 0] ?? 0;
    const itemSize = index === undefined ? 0 : offsets[index + 1] - itemStart;
    const fraction = Math.min(1, Math.max(0, offset));
    return Math.max(
      0,
      Math.min(maximumScroll, startOffset + itemStart + fraction * itemSize),
    );
  }
  // With no surviving key, a position inside the leading content stays where
  // it is, and a position inside the rows moves to the first row.
  const fraction =
    index === undefined
      ? Math.min(0, Math.max(-startOffset, offset))
      : Math.min(Math.max(-startOffset, offset), rowHeight);
  return Math.min(
    maximumScroll,
    startOffset + (index ?? 0) * rowHeight + fraction,
  );
}
