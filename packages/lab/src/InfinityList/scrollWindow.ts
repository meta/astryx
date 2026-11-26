// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file scrollWindow.ts
 * @input Logical item position and a fixed-pitch viewport
 * @output Viewport bounds and a range from the shared planner
 * @position Geometry adapter for the Lab list
 */
import {calculateListWindow} from '@astryxdesign/core/internal/virtualization';

export interface ScrollGeometry {
  itemCount: number;
  itemHeight: number;
  viewportHeight: number;
}

export interface ScrollPosition {
  index: number;
  offset: number;
}

export const INITIAL_POSITION: ScrollPosition = {index: 0, offset: 0};

export function endPosition({
  itemCount,
  itemHeight,
  viewportHeight,
}: ScrollGeometry): ScrollPosition {
  const fullRows = Math.floor(viewportHeight / itemHeight);
  const remainder = viewportHeight % itemHeight;
  if (itemCount <= viewportHeight / itemHeight) {
    return INITIAL_POSITION;
  }
  return remainder === 0
    ? {index: itemCount - fullRows, offset: 0}
    : {index: itemCount - fullRows - 1, offset: itemHeight - remainder};
}

export function movePosition(
  geometry: ScrollGeometry,
  position: ScrollPosition,
  delta: number,
): ScrollPosition {
  if (!Number.isFinite(delta) || delta === 0) {
    return position;
  }
  const height = geometry.itemHeight;
  const offset = position.offset + delta;
  const rows = Math.floor(offset / height);
  const end = endPosition(geometry);
  if (rows > end.index - position.index) {
    return end;
  }
  if (rows < -position.index) {
    return INITIAL_POSITION;
  }
  const index = position.index + rows;
  const remainder = Math.max(0, offset - rows * height);
  return index === end.index && remainder > end.offset
    ? end
    : {index, offset: remainder};
}

export function jumpToItem(
  geometry: ScrollGeometry,
  index: number,
): ScrollPosition {
  const end = endPosition(geometry);
  return index > end.index ? end : {index: Math.max(0, index), offset: 0};
}

export function wheelDistance(
  geometry: ScrollGeometry,
  {deltaX, deltaY, deltaMode, shiftKey}: WheelEvent,
) {
  if (shiftKey && deltaX === 0) {
    return 0;
  }
  return (
    deltaY *
    (deltaMode === 1
      ? geometry.itemHeight
      : deltaMode === 2
        ? geometry.viewportHeight
        : 1)
  );
}

export function scrollFraction(
  geometry: ScrollGeometry,
  position: ScrollPosition,
): number {
  const end = endPosition(geometry);
  const last = end.index + end.offset / geometry.itemHeight;
  return last === 0
    ? 0
    : (position.index + position.offset / geometry.itemHeight) / last;
}

export function positionAtFraction(
  geometry: ScrollGeometry,
  fraction: number,
): ScrollPosition {
  if (fraction <= 0) {
    return INITIAL_POSITION;
  }
  const end = endPosition(geometry);
  if (fraction >= 1) {
    return end;
  }
  const target = fraction * (end.index + end.offset / geometry.itemHeight);
  const index = Math.floor(target);
  return {index, offset: (target - index) * geometry.itemHeight};
}

export function readScrollWindow(
  {itemCount, itemHeight, viewportHeight}: ScrollGeometry,
  {index, offset}: ScrollPosition,
) {
  // Plan in viewport-local coordinates so large indices cannot round away input deltas.
  const origin = Math.max(0, index - 4);
  const plan = calculateListWindow({
    rowCount: Math.min(
      itemCount - origin,
      Math.ceil(viewportHeight / itemHeight) + 10,
    ),
    rowHeight: itemHeight,
    viewportHeight,
    scrollTop: (index - origin) * itemHeight + offset,
    startOffset: 0,
    isMeasured: true,
  });
  return {start: origin + (plan?.start ?? 0), end: origin + (plan?.end ?? 0)};
}

export function coversViewport(
  {itemCount, itemHeight, viewportHeight}: ScrollGeometry,
  {index, offset}: ScrollPosition,
  range: ReturnType<typeof readScrollWindow>,
) {
  const end = Math.min(
    itemCount,
    index + Math.ceil((offset + viewportHeight) / itemHeight),
  );
  return index >= range.start && end <= range.end;
}
