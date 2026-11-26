// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file scrollWindow.ts
 * @input Fixed item pitch and a bounded native scroll position
 * @output Logical item indices and the current native scroll extent
 * @position Geometry adapter for the Lab list
 */
import {calculateListWindow} from '@astryxdesign/core/internal/virtualization';

export interface ScrollGeometry {
  itemCount: number;
  itemHeight: number;
  viewportHeight: number;
}

export interface ScrollPosition {
  bandStart: number;
  scrollTop: number;
}

export const INITIAL_POSITION: ScrollPosition = {bandStart: 0, scrollTop: 0};

// Keep the spacer well inside the range that engines can lay out natively.
const MAX_NATIVE_HEIGHT = 1_000_000;

function getBandSize({itemCount, itemHeight}: ScrollGeometry): number {
  return Math.min(itemCount, Math.floor(MAX_NATIVE_HEIGHT / itemHeight));
}

// Without rebasing, the native range stops at the end of the first band.
function placeBand(
  geometry: ScrollGeometry,
  index: number,
  offset: number,
): ScrollPosition {
  const {itemCount, itemHeight, viewportHeight} = geometry;
  const bandSize = getBandSize(geometry);
  const bandStart = Math.max(
    0,
    Math.min(itemCount - bandSize, index - Math.floor(bandSize / 2)),
  );
  return {
    bandStart,
    scrollTop: Math.min(
      Math.max(0, bandSize * itemHeight - viewportHeight),
      (index - bandStart) * itemHeight + offset,
    ),
  };
}

export function jumpToItem(
  geometry: ScrollGeometry,
  index: number,
): ScrollPosition {
  return placeBand(
    geometry,
    Math.max(0, Math.min(geometry.itemCount - 1, index)),
    0,
  );
}

export function updateScrollWindow(
  geometry: ScrollGeometry,
  position: ScrollPosition,
  scrollTop: number,
): ScrollPosition {
  const {itemCount, itemHeight, viewportHeight} = geometry;
  const bandSize = getBandSize(geometry);
  const height = bandSize * itemHeight;
  const top = Math.max(0, Math.min(height - viewportHeight, scrollTop));
  const nearStart = top < height / 4 && position.bandStart > 0;
  const nearEnd =
    top + viewportHeight > (height * 3) / 4 &&
    position.bandStart < itemCount - bandSize;
  if (nearStart || nearEnd) {
    const index = Math.floor(top / itemHeight);
    return placeBand(
      geometry,
      position.bandStart + index,
      top - index * itemHeight,
    );
  }
  return top === position.scrollTop ? position : {...position, scrollTop: top};
}

export function readScrollWindow(
  geometry: ScrollGeometry,
  position: ScrollPosition,
) {
  const rowCount = getBandSize(geometry);
  const {itemHeight, viewportHeight} = geometry;
  const plan = calculateListWindow({
    rowCount,
    rowHeight: itemHeight,
    viewportHeight,
    scrollTop: position.scrollTop,
    startOffset: 0,
    isMeasured: true,
  });
  return {
    start: position.bandStart + (plan?.start ?? 0),
    end: position.bandStart + (plan?.end ?? 0),
    firstVisibleIndex: position.bandStart + (plan?.firstVisibleIndex ?? 0),
    offset: (plan?.start ?? 0) * itemHeight,
    height: rowCount * itemHeight,
  };
}
