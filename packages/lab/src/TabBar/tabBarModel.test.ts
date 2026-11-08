// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file tabBarModel.test.ts
 * @input vitest and tabBarModel.ts
 * @output Checks TabBar's geometry against UIKit's layouts measured on iOS
 *   26.2: the capsule's width, the items' width and centres, and right to
 *   left. Also the item a lift commits, the rubber band, the lifted lens and
 *   the copy's counter-transform.
 * @position Testing; pure math, no DOM
 */

import {describe, expect, it} from 'vitest';
import {tabBar} from './uikitTabBar';
import {
  copyTransform,
  itemCenters,
  itemWidth,
  itemWidthCss,
  lensTarget,
  liftScale,
  naturalWidth,
  nearestIndex,
} from './tabBarModel';

/**
 * UIKit's layouts: capsule width, then the items' screen x and width (the
 * capsule's own x subtracted below).
 */
const UIKIT_LAYOUTS = [
  {label: '2 tabs', capsuleX: 107, capsule: 188, width: 94, xs: [111, 197]},
  {label: '3 tabs', capsuleX: 64, capsule: 274, width: 94, xs: [68, 154, 240]},
  {
    label: '4 tabs',
    capsuleX: 21,
    capsule: 360,
    width: 98,
    xs: [25, 109.67, 194.33, 279],
  },
  {
    label: '5 tabs',
    capsuleX: 21,
    capsule: 360,
    width: 77,
    xs: [25, 93.75, 162.5, 231.25, 300],
  },
  {
    label: '3 tabs and search',
    capsuleX: 21,
    capsule: 290,
    width: 100.67,
    xs: [25, 115.67, 206.33],
  },
  {
    label: '4 tabs and search',
    capsuleX: 21,
    capsule: 290,
    width: 76,
    xs: [25, 93.67, 162.33, 231],
  },
];

describe('naturalWidth', () => {
  it('is UIKit’s capsule for two and three tabs, and reaches the 360 pt screen with four', () => {
    expect(naturalWidth(2)).toBe(188);
    expect(naturalWidth(3)).toBe(274);
    expect(naturalWidth(4)).toBe(360);
  });
});

describe('itemWidth and itemCenters', () => {
  for (const layout of UIKIT_LAYOUTS) {
    it(`match UIKit within a point: ${layout.label}`, () => {
      const n = layout.xs.length;
      expect(
        Math.abs(itemWidth(layout.capsule, n) - layout.width),
      ).toBeLessThan(1);
      const centers = itemCenters(layout.capsule, n);
      centers.forEach((center, i) => {
        const uikit = layout.xs[i] - layout.capsuleX + layout.width / 2;
        expect(Math.abs(center - uikit)).toBeLessThan(1);
      });
    });
  }

  it('keeps the first and last items one inset from the edges, the rest evenly between', () => {
    const centers = itemCenters(360, 5);
    const size = itemWidth(360, 5);
    expect(centers[0]).toBeCloseTo(4 + size / 2, 9);
    expect(centers[4]).toBeCloseTo(360 - 4 - size / 2, 9);
    const steps = centers.slice(1).map((center, i) => center - centers[i]);
    for (const step of steps) {
      expect(step).toBeCloseTo(steps[0], 9);
    }
  });

  it('mirrors in a right-to-left capsule (the first item on the right)', () => {
    expect(itemCenters(290, 4, true)).toEqual(
      itemCenters(290, 4).map(x => 290 - x),
    );
  });

  it('centres a single item and has nothing for none', () => {
    expect(itemCenters(200, 1)).toEqual([100]);
    expect(itemCenters(200, 0)).toEqual([]);
  });

  it('spells the same width in CSS', () => {
    expect(itemWidthCss(4)).toBe(
      'min(1.0659 * 100cqw / 4 + 0.0436 * 100cqw - 14.61px, 100cqw - 8px)',
    );
  });
});

describe('nearestIndex: the item nearest a finger', () => {
  const centers = itemCenters(290, 4);

  it('picks the nearest centre', () => {
    expect(nearestIndex(centers[2] + 20, centers)).toBe(2);
    expect(nearestIndex(centers[1] - 30, centers)).toBe(1);
  });

  it('gives a tie to the leading (earlier) item', () => {
    const midpoint = (centers[1] + centers[2]) / 2;
    expect(nearestIndex(midpoint, centers)).toBe(1);
    // In a right-to-left capsule the earlier item is on the right.
    const rtl = itemCenters(290, 4, true);
    expect(nearestIndex((rtl[1] + rtl[2]) / 2, rtl)).toBe(1);
  });
});

describe('lensTarget', () => {
  const centers = itemCenters(290, 4);

  it('follows the finger between the first and last centres', () => {
    expect(lensTarget(150, centers)).toBe(150);
  });

  it('rubber-bands past the ends: 60 px past the last item leaves the lens ~8 px past it', () => {
    expect(lensTarget(centers[3] + 60, centers) - centers[3]).toBeCloseTo(
      7.98,
      1,
    );
    expect(lensTarget(centers[0] - 60, centers) - centers[0]).toBeCloseTo(
      -7.98,
      1,
    );
  });

  it('never passes the rubber band’s dimension however far the finger goes', () => {
    expect(lensTarget(centers[3] + 10_000, centers) - centers[3]).toBeLessThan(
      tabBar.lensEdgeDimension,
    );
  });
});

describe('liftScale', () => {
  it('grows a 76 × 54 lens to 92 × 70, and a 98 px one to 114 px', () => {
    const lifted = liftScale(76);
    expect(76 * lifted.x).toBeCloseTo(92, 6);
    expect(tabBar.itemHeight * lifted.y).toBeCloseTo(70, 6);
    expect(98 * liftScale(98).x).toBeCloseTo(114, 6);
  });
});

describe('copyTransform', () => {
  it('undoes the lens’s translate and scale about the same origin', () => {
    // A point p in the copy maps to the lens as O + T_c + S_c (p − O). It then
    // maps to the capsule as O + T + S (q − O), and the composition must be p.
    const origin = {x: 38, y: 27};
    const lifted = liftScale(76);
    for (const [x, sx, sy] of [
      [0, 1, 1],
      [42.5, 1, 1],
      [-80, lifted.x, lifted.y],
      [13.25, 1.31, 0.87],
    ]) {
      const copy = copyTransform(x, sx, sy);
      for (const p of [
        {x: 0, y: 0},
        {x: 120, y: 31},
        {x: -55.5, y: 9},
      ]) {
        const q = {
          x: origin.x + copy.x + copy.scaleX * (p.x - origin.x),
          y: origin.y + copy.scaleY * (p.y - origin.y),
        };
        const onScreen = {
          x: origin.x + x + sx * (q.x - origin.x),
          y: origin.y + sy * (q.y - origin.y),
        };
        expect(onScreen.x).toBeCloseTo(p.x, 9);
        expect(onScreen.y).toBeCloseTo(p.y, 9);
      }
    }
  });
});
