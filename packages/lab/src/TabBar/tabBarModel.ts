// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file tabBarModel.ts
 * @input TabBar's UIKit values (uikitTabBar.ts)
 * @output TabBar's pure geometry: the items' widths and centres, the item a
 *   lift commits, and the lens's target and scale. Also the minimized
 *   circle and the accessory's and the search field's boxes.
 * @position Math of the lab TabBar; no DOM, no React. Coordinates are the
 *   capsule's own, in px, before its flex scale. x runs from its left edge,
 *   and items go in logical order.
 *
 * SYNC: When modified, update tabBarModel.test.ts, TabBar.tsx (its CSS
 * spelling of the same geometry) and uikitTabBar.ts.
 */

import {rubberBand} from '@astryxdesign/core/internal/touch';
import {tabBar} from './uikitTabBar';

/** The widest a capsule of `count` tabs gets without a search tab, px. */
export function naturalWidth(count: number): number {
  return tabBar.naturalWidth.base + tabBar.naturalWidth.perTab * count;
}

/**
 * The width every item (and the resting lens) has in a capsule `width` px
 * wide, never wider than the capsule's inside.
 */
export function itemWidth(width: number, count: number): number {
  const {perSlot, perBar, offset} = tabBar.itemWidth;
  return Math.min(
    (perSlot * width) / Math.max(count, 1) + perBar * width + offset,
    width - 2 * tabBar.itemInset,
  );
}

/**
 * The same width as a CSS expression of the capsule's width, `100cqw` (the
 * capsule is the size container), for use inside `calc()`.
 */
export function itemWidthCss(count: number): string {
  const {perSlot, perBar, offset} = tabBar.itemWidth;
  const sign = offset < 0 ? '-' : '+';
  const inside = `100cqw - ${2 * tabBar.itemInset}px`;
  return `min(${perSlot} * 100cqw / ${Math.max(count, 1)} + ${perBar} * 100cqw ${sign} ${Math.abs(offset)}px, ${inside})`;
}

/**
 * The centres of `count` items in a capsule `width` px wide, in logical order.
 * The first and last items sit `itemInset` from the edges and the others are
 * spread evenly between them. In a right-to-left capsule the first item is on
 * the right.
 */
export function itemCenters(
  width: number,
  count: number,
  isRtl = false,
): number[] {
  if (count <= 0) {
    return [];
  }
  const size = itemWidth(width, count);
  const first = tabBar.itemInset + size / 2;
  const centers =
    count === 1
      ? [width / 2]
      : Array.from(
          {length: count},
          (_, i) => first + ((width - 2 * first) * i) / (count - 1),
        );
  return isRtl ? centers.map(center => width - center) : centers;
}

/**
 * The item a finger lifted at `x` commits: the one whose centre is nearest,
 * the earlier one on a tie. No projection: a flick commits where it lifts.
 */
export function nearestIndex(
  x: number,
  centers: ReadonlyArray<number>,
): number {
  let best = 0;
  let bestDistance = Infinity;
  centers.forEach((center, index) => {
    const distance = Math.abs(x - center);
    // Strictly nearer only: a tie keeps the earlier (leading) item.
    if (distance < bestDistance - 1e-9) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

/**
 * Where the lens heads for a finger at `x`: the finger itself between the
 * first and last centres, rubber-banded past them.
 */
export function lensTarget(x: number, centers: ReadonlyArray<number>): number {
  if (centers.length === 0) {
    return x;
  }
  const min = Math.min(...centers);
  const max = Math.max(...centers);
  if (x < min) {
    return min + rubberBand(x - min, tabBar.lensEdgeDimension);
  }
  if (x > max) {
    return max + rubberBand(x - max, tabBar.lensEdgeDimension);
  }
  return x;
}

/**
 * The lifted lens's scale on each axis for items `width` px wide: the item
 * grown by `liftOutset` on every side.
 */
export function liftScale(width: number): {x: number; y: number} {
  return {
    x: (width + 2 * tabBar.liftOutset) / width,
    y: (tabBar.itemHeight + 2 * tabBar.liftOutset) / tabBar.itemHeight,
  };
}

/**
 * The selected copy of the items lives inside the lens, which moves by `x` and
 * scales by (`scaleX`, `scaleY`) about its centre. Applied to the copy about
 * the same point, this transform puts the copy back where the items are. So the
 * lens shows the selected look of whatever is under it.
 */
export function copyTransform(
  x: number,
  scaleX: number,
  scaleY: number,
): {x: number; scaleX: number; scaleY: number} {
  return {x: -x / scaleX, scaleX: 1 / scaleX, scaleY: 1 / scaleY};
}

/**
 * The minimized circle's centre in a capsule `width` px wide: concentric with
 * the capsule's leading cap.
 */
export function minimizedCenter(width: number, isRtl = false): number {
  const half = tabBar.barHeight / 2;
  return isRtl ? width - half : half;
}

export interface AccessoryBox {
  /** From the capsule's inline-start edge, px. */
  readonly start: number;
  /** From the capsule's top edge, px (negative: above it). */
  readonly top: number;
  readonly width: number;
}

/**
 * The bottom accessory's box in a bar `width` px wide (the capsule, and the
 * search circle when there is one). Above the bar it is as wide as the bar.
 * Minimized, it sits inline between the circle and the bar's trailing end,
 * concentric with the trailing cap. With a minimized search circle it ends
 * `accessoryGap` before that circle.
 */
export function accessoryBox(
  width: number,
  isInline: boolean,
  hasSearch = false,
): AccessoryBox {
  const {barHeight, minimizedSize, accessoryHeight, accessoryGap} = tabBar;
  if (!isInline) {
    return {start: 0, top: -(accessoryGap + accessoryHeight), width};
  }
  const start = barHeight / 2 + minimizedSize / 2 + accessoryGap;
  return {
    start,
    top: (barHeight - accessoryHeight) / 2,
    width: width - start - accessoryEnd(hasSearch),
  };
}

/** The inline accessory's distance from the bar's trailing end. */
export function accessoryEnd(hasSearch: boolean): number {
  const inset = (tabBar.barHeight - tabBar.minimizedSize) / 2;
  return hasSearch ? inset + tabBar.minimizedSize + tabBar.accessoryGap : inset;
}

/**
 * The search field's box in a bar `width` px wide, from the bar's inline-start
 * edge. Inline in the bar's row beside the leading circle, or (active) spanning
 * the screen but for the cancel button. `top` is the inline row, where the
 * active field stays too.
 */
export function searchFieldBox(width: number, isActive: boolean): AccessoryBox {
  const {barHeight, minimizedSize, searchFieldGap, barInset, searchActive} =
    tabBar;
  const inset = (barHeight - minimizedSize) / 2;
  const top = inset;
  if (!isActive) {
    const start = inset + minimizedSize + searchFieldGap;
    return {start, top, width: width - start - inset};
  }
  const outset = barInset - searchActive.inset;
  return {
    start: -outset,
    top,
    width:
      width + 2 * outset - searchActive.cancelSize - searchActive.cancelGap,
  };
}

/**
 * How far the search circle moves as it becomes the active field's cancel
 * button. From the minimized circle's place at the bar's trailing end to
 * `searchActive.inset` from the screen's edge, px toward the trailing side.
 */
export function searchCancelShift(): number {
  const {barInset, barHeight, minimizedSize, searchActive} = tabBar;
  return barInset + (barHeight - minimizedSize) / 2 - searchActive.inset;
}

/**
 * The search field's lift above the keyboard, in px (negative is up). The
 * field's bottom rests at `fieldBottom` (viewport px, unlifted). It moves for
 * its bottom to sit `searchKeyboardGap` above a keyboard covering `inset` px of
 * a `viewportHeight` px layout viewport. A keyboard too low to reach the field
 * lifts nothing.
 */
export function searchLift(
  viewportHeight: number,
  inset: number,
  fieldBottom: number,
): number {
  return Math.min(
    0,
    viewportHeight - inset - tabBar.searchKeyboardGap - fieldBottom,
  );
}
