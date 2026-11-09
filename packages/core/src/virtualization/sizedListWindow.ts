// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file sizedListWindow.ts
 * @input An item offset model, scroll geometry and an overscan in CSS pixels
 *   before and after the scrollport
 * @output The same row and gap plan as the fixed-pitch window, for items whose
 *   sizes differ or are measured as they render
 * @position The list-windowing module's sized window. It reads offsets only
 *   through `ListItemSizes`, so the offset model stays swappable.
 */
import type {ListItemSizes} from './itemSizes';
import {
  createWindowSegments,
  isPositiveFinite,
  type ListWindowPlan,
  type ListWindowSegment,
} from './listWindow';

export interface SizedListWindowOptions {
  sizes: ListItemSizes;
  viewportHeight: number;
  scrollTop: number;
  /** Measured full content extent; does not change the item total. */
  scrollHeight?: number;
  /** Distance from the scroll origin to the first item, such as a header. */
  startOffset: number;
  isMeasured: boolean;
  /** Extra rendered distance before the scrollport, in CSS pixels. */
  overscanBefore: number;
  /** Extra rendered distance after the scrollport, in CSS pixels. */
  overscanAfter: number;
  focusIndex?: number;
}

/** The number of items that start before `offset`. */
function itemsStartingBefore(sizes: ListItemSizes, offset: number): number {
  if (offset <= 0 || sizes.count === 0) {
    return 0;
  }
  const index = sizes.indexAt(offset);
  return sizes.offsetOf(index) < offset ? index + 1 : index;
}

/** Returns null when the inputs cannot form a finite window. */
export function calculateSizedListWindow(
  options: SizedListWindowOptions,
): ListWindowPlan | null {
  const {
    sizes,
    viewportHeight,
    scrollTop,
    startOffset,
    isMeasured,
    overscanBefore,
    overscanAfter,
    focusIndex,
  } = options;
  const {count, total} = sizes;
  if (
    !Number.isSafeInteger(count) ||
    count < 0 ||
    !isPositiveFinite(viewportHeight) ||
    !Number.isFinite(total) ||
    total < 0 ||
    !Number.isFinite(startOffset + total) ||
    !Number.isFinite(scrollTop) ||
    (options.scrollHeight !== undefined &&
      (!Number.isFinite(options.scrollHeight) || options.scrollHeight < 0)) ||
    !Number.isFinite(startOffset) ||
    startOffset < 0 ||
    !Number.isFinite(overscanBefore) ||
    overscanBefore < 0 ||
    !Number.isFinite(overscanAfter) ||
    overscanAfter < 0
  ) {
    return null;
  }
  if (count === 0) {
    return {
      segments: [],
      start: 0,
      end: 0,
      firstVisibleIndex: 0,
      offset: 0,
      totalHeight: 0,
    };
  }
  const contentHeight = Math.max(
    startOffset + total,
    options.scrollHeight ?? 0,
  );
  const maximumScroll = Math.max(0, contentHeight - viewportHeight);
  const clampedScroll = Math.min(maximumScroll, Math.max(0, scrollTop));
  const listTop = clampedScroll - startOffset;
  const bodyTop = Math.min(total, Math.max(0, listTop));
  const bodyBottom = Math.min(
    total,
    Math.max(0, clampedScroll + viewportHeight - startOffset),
  );
  const firstVisibleIndex = isMeasured ? sizes.indexAt(bodyTop) : 0;
  // Above the first item, the offset is the negative distance to it, as in
  // the fixed-pitch window.
  const offset = !isMeasured
    ? 0
    : listTop < 0
      ? listTop
      : bodyTop - sizes.offsetOf(firstVisibleIndex);
  // The overscan before is measured from the first visible item's start, so a
  // fixed pitch overscans whole items, as the fixed-pitch window does.
  const start = isMeasured
    ? sizes.indexAt(sizes.offsetOf(firstVisibleIndex) - overscanBefore)
    : 0;
  const end = isMeasured
    ? Math.min(
        count,
        Math.max(
          firstVisibleIndex,
          itemsStartingBefore(sizes, bodyBottom + overscanAfter),
        ),
      )
    : Math.min(
        count,
        itemsStartingBefore(sizes, viewportHeight + overscanAfter),
      );
  return {
    segments: createSizedListWindowSegments(sizes, start, end, focusIndex),
    start,
    end,
    firstVisibleIndex,
    offset,
    totalHeight: total,
  };
}

/** Mounted items and gaps for a range, plus one retained item outside it. */
export function createSizedListWindowSegments(
  sizes: ListItemSizes,
  start: number,
  end: number,
  focusIndex?: number,
): ListWindowSegment[] {
  return createWindowSegments(
    sizes.count,
    start,
    end,
    focusIndex,
    (from, to) => sizes.offsetOf(to) - sizes.offsetOf(from),
  );
}
