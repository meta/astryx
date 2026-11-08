// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file tabBarModel.ts
 * @input TabBar's UIKit values (uikitTabBar.ts)
 * @output TabBar's pure geometry: the items' widths and centres, the item
 *   nearest a finger, and the lens's target and scale.
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
 * The item nearest a finger at `x`: the one whose centre is nearest, the
 * earlier one on a tie. TabBar asks it whether a finger landed on a disabled
 * tab.
 */
export function nearestIndex(
  x: number,
  centers: ReadonlyArray<number>,
): number {
  let best = 0;
  let bestDistance = Infinity;
  centers.forEach((center, index) => {
    const distance = Math.abs(x - center);
    // Float centres can differ by rounding. A difference under 1e-9 px counts
    // as a tie.
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
