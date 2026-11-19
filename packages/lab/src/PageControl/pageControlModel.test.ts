// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file pageControlModel.test.ts
 * @input vitest, pageControlModel.ts, the UIKit page-control table
 * @output Proves the page-control math against UIPageControl's measurements:
 *   sizes, the 50-page window, the tap rule, the scrub and the jog's cadence
 * @position Testing
 */

import {describe, expect, it} from 'vitest';
import {
  fullPages,
  indicatorSize,
  jogInterval,
  pageControlLayout,
  PITCH,
  scrubTarget,
  tapTarget,
  windowFor,
} from './pageControlModel';

describe('pageControlLayout', () => {
  it("matches UIPageControl's measured width for 5 pages", () => {
    const layout = pageControlLayout(5);
    expect(layout.rowWidth).toBeCloseTo(80.35, 1);
    expect(layout.width).toBeCloseTo(108.3, 0);
    expect(layout.slots).toBe(5);
    expect(layout.isWindowed).toBe(false);
  });

  it('caps the width at 161.3 for 50 pages and shows ten slots', () => {
    const layout = pageControlLayout(50);
    expect(layout.width).toBe(161.3);
    expect(layout.slots).toBe(10);
    expect(layout.isWindowed).toBe(true);
  });

  it('is empty without pages', () => {
    expect(pageControlLayout(0)).toEqual({
      width: 28,
      slots: 0,
      rowWidth: 0,
      isWindowed: false,
    });
  });
});

/** The sizes of the ten shown slots, rounded to 0.01 pt. */
function shown(count: number, windowStart: number): number[] {
  return Array.from(
    {length: 10},
    (_, i) =>
      Math.round(indicatorSize(count, windowStart, windowStart + i) * 100) /
      100,
  );
}

describe('the window of a 50-page control (as measured at pages 0, 10, 25, 49)', () => {
  it('page 0: pages 0–7 full, then 7.33 and 4.31', () => {
    const start = windowFor(50, 0, 0);
    expect(start).toBe(0);
    expect(shown(50, start)).toEqual([
      9.67, 9.67, 9.67, 9.67, 9.67, 9.67, 9.67, 9.67, 7.33, 4.31,
    ]);
    expect(indicatorSize(50, start, 10)).toBe(0);
  });

  it('page 10 from page 0: the current page in the last full slot, edges shrunk on both sides', () => {
    const start = windowFor(50, 0, 10);
    expect(start).toBe(3);
    expect(shown(50, start)).toEqual([
      4.31, 7.33, 9.67, 9.67, 9.67, 9.67, 9.67, 9.67, 7.33, 4.31,
    ]);
    expect(fullPages(50, start)).toEqual([5, 10]);
  });

  it('page 25 from page 10: the same shape, the current page last', () => {
    const start = windowFor(50, 3, 25);
    expect(fullPages(50, start)[1]).toBe(25);
  });

  it('page 49: eight full slots ending at the current page, 7.33 and 4.31 on the left', () => {
    const start = windowFor(50, 18, 49);
    expect(start).toBe(40);
    expect(shown(50, start)).toEqual([
      4.31, 7.33, 9.67, 9.67, 9.67, 9.67, 9.67, 9.67, 9.67, 9.67,
    ]);
  });

  it('moves only when the current page would land in a shrunk slot', () => {
    expect(windowFor(50, 3, 7)).toBe(3);
    expect(windowFor(50, 3, 11)).toBe(4);
    expect(windowFor(50, 3, 4)).toBe(2);
  });

  it('a control with ten pages or fewer never windows', () => {
    expect(windowFor(10, 0, 9)).toBe(0);
    expect(shown(10, 0)).toEqual(Array.from({length: 10}, () => 9.67));
  });
});

describe('tapTarget', () => {
  it('a tap on the trailing side moves forward one page, the leading side back', () => {
    expect(tapTarget(60, 50, 2, 5, false)).toBe(3);
    expect(tapTarget(40, 50, 2, 5, false)).toBe(1);
  });

  it('mirrors in RTL', () => {
    expect(tapTarget(40, 50, 2, 5, true)).toBe(3);
    expect(tapTarget(60, 50, 2, 5, true)).toBe(1);
  });

  it('stops at the first and last pages', () => {
    expect(tapTarget(60, 50, 4, 5, false)).toBe(4);
    expect(tapTarget(40, 50, 0, 5, false)).toBe(0);
  });
});

describe('scrubTarget', () => {
  it('switches at the midpoint between indicator centres (measured 192.3 / 210.3 / 229.0 on a 5-page control whose first centre is at 166)', () => {
    // The measured switch points, relative to the first indicator's centre.
    expect(scrubTarget(192.3 - 166 - 0.5, 5, 0)).toBe(1);
    expect(scrubTarget(192.3 - 166 + 0.5, 5, 0)).toBe(2);
    expect(scrubTarget(210.3 - 166 - 0.5, 5, 0)).toBe(2);
    expect(scrubTarget(210.3 - 166 + 0.5, 5, 0)).toBe(3);
    expect(scrubTarget(1.5 * PITCH + 2.5 * PITCH, 5, 0)).toBe(4);
  });

  it('stays within the pages', () => {
    expect(scrubTarget(-40, 5, 0)).toBe(0);
    expect(scrubTarget(400, 5, 0)).toBe(4);
  });

  it('in a window, stays within the pages shown at full size', () => {
    // Window at 3 (page 10 current): full pages 5–10.
    expect(scrubTarget(0, 50, 3)).toBe(5);
    expect(scrubTarget(5 * PITCH, 50, 3)).toBe(8);
    expect(scrubTarget(9 * PITCH, 50, 3)).toBe(10);
  });
});

describe('jogInterval', () => {
  it('does not step inside the content', () => {
    expect(jogInterval(0)).toBe(Infinity);
    expect(jogInterval(-5)).toBe(Infinity);
  });

  it('steps faster the further past the edge, at most 15 pages a second (the least-squares fit of the measured run: 266 ms at 19 pt, 66 ms at 76 pt)', () => {
    expect(jogInterval(19)).toBeCloseTo(0.304, 2);
    expect(jogInterval(45.7)).toBeCloseTo(0.126, 2);
    expect(jogInterval(76)).toBeCloseTo(0.076, 2);
    expect(jogInterval(110)).toBeCloseTo(1 / 15, 5);
  });

  it('a run toward the first page steps at the measured 10 pages a second 77 pt past the edge, where the run toward the last steps at 13.3 (spec:AST-094 FR1)', () => {
    expect(1 / jogInterval(77, -1)).toBeCloseTo(10, 0);
    expect(1 / jogInterval(77, 1)).toBeCloseTo(13.3, 1);
    expect(jogInterval(150, -1)).toBeCloseTo(1 / 15, 5);
  });
});
