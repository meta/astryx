// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file tableWindow.ts
 * @input Fixed CSS-pixel pitch, body-relative viewport geometry and canonical indices
 * @output Private half-open row/gap segments and first-visible-key reconciliation
 * @position Pure Table window planning before product cells are constructed
 */
export type WindowSegment =
  | {type: 'rows'; start: number; end: number}
  | {type: 'gap'; start: number; end: number; height: number};

export interface TableWindowOptions {
  rowCount: number;
  rowHeight: number;
  viewportHeight: number;
  scrollTop: number;
  /** Measured full content extent; does not change the logical row total. */
  scrollHeight?: number;
  bodyOffset: number;
  isMeasured: boolean;
  focusIndex?: number;
}

export interface TableWindowPlan {
  segments: WindowSegment[];
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
export function calculateTableWindow(
  options: TableWindowOptions,
): TableWindowPlan | null {
  const {
    rowCount,
    rowHeight,
    viewportHeight,
    scrollTop,
    bodyOffset,
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
    !Number.isFinite(bodyOffset + totalHeight) ||
    !Number.isFinite(viewportHeight / rowHeight) ||
    !Number.isFinite(scrollTop) ||
    (options.scrollHeight !== undefined &&
      (!Number.isFinite(options.scrollHeight) || options.scrollHeight < 0)) ||
    !Number.isFinite(bodyOffset) ||
    bodyOffset < 0
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
    bodyOffset + totalHeight,
    options.scrollHeight ?? 0,
  );
  const maximumScroll = Math.max(0, contentHeight - viewportHeight);
  const clampedScroll = Math.min(maximumScroll, Math.max(0, scrollTop));
  const bodyTop = Math.min(
    totalHeight,
    Math.max(0, clampedScroll - bodyOffset),
  );
  const bodyBottom = Math.min(
    totalHeight,
    Math.max(0, clampedScroll + viewportHeight - bodyOffset),
  );
  const firstVisibleIndex = isMeasured
    ? Math.min(rowCount - 1, Math.floor(bodyTop / rowHeight))
    : 0;
  const offset = isMeasured ? bodyTop - firstVisibleIndex * rowHeight : 0;
  const start = isMeasured ? Math.max(0, firstVisibleIndex - 4) : 0;
  const end = isMeasured
    ? Math.min(
        rowCount,
        Math.max(firstVisibleIndex, Math.ceil(bodyBottom / rowHeight)) + 4,
      )
    : Math.min(rowCount, Math.ceil(viewportHeight / rowHeight) + 4);
  return {
    segments: createTableWindowSegments(
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

/** Canonical mounted-set projection, shared by arithmetic and React memoization. */
export function createTableWindowSegments(
  rowCount: number,
  rowHeight: number,
  start: number,
  end: number,
  focusIndex?: number,
): WindowSegment[] {
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
  const segments: WindowSegment[] = [];
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

export interface TableAnchorOptions {
  previousKeys: ReadonlyArray<string | number>;
  keys: ReadonlyArray<string | number>;
  firstVisibleIndex: number;
  offset: number;
  rowHeight: number;
  viewportHeight: number;
  bodyOffset: number;
  /** Existing non-row content extent retained across logical data changes. */
  trailingContentHeight?: number;
  /** Parent/hook changed-input lookup; never constructed on scroll. */
  keyIndices?: ReadonlyMap<string | number, number>;
}

export function reconcileTableAnchor(options: TableAnchorOptions): number {
  const {
    previousKeys,
    keys,
    firstVisibleIndex,
    offset,
    rowHeight,
    viewportHeight,
    bodyOffset,
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
  const maximumScroll = Math.max(
    0,
    bodyOffset +
      keys.length * rowHeight +
      (options.trailingContentHeight ?? 0) -
      viewportHeight,
  );
  const fraction =
    index === undefined ? 0 : Math.min(Math.max(0, offset), rowHeight);
  return Math.min(
    maximumScroll,
    bodyOffset + (index ?? 0) * rowHeight + fraction,
  );
}
