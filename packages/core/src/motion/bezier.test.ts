// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file bezier.test.ts
 * @input vitest, the cubic-bézier timing function
 * @output Checks the solver against the curve's own parametric form and the
 *   properties every CSS / Core Animation timing curve has
 * @position Testing; validates bezier.ts without a browser
 */

import {describe, expect, it} from 'vitest';
import {cubicBezier, type BezierPoints} from './bezier';
import {timing} from './uikit/timing';

const CURVES: BezierPoints[] = [
  timing.curves.viewChange,
  timing.curves.move,
  timing.curves.exit,
  timing.curves.entrance,
  [0.24, 1, 0.4, 1],
  [0.3, 0, 0.6, 0.6],
];

describe('cubicBezier', () => {
  it.each(CURVES)('matches the parametric curve (%s)', (...points) => {
    const [x1, y1, x2, y2] = points;
    const ease = cubicBezier(points);
    const axis = (a: number, b: number, t: number) =>
      3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
    for (let t = 0; t <= 1; t += 1 / 256) {
      expect(ease(axis(x1, x2, t))).toBeCloseTo(axis(y1, y2, t), 5);
    }
  });

  it('runs from 0 to 1 and clamps outside', () => {
    for (const points of CURVES) {
      const ease = cubicBezier(points);
      expect(ease(0)).toBe(0);
      expect(ease(1)).toBe(1);
      expect(ease(-0.5)).toBe(0);
      expect(ease(1.5)).toBe(1);
    }
  });

  it('ease-in-out is symmetric about its midpoint', () => {
    const ease = cubicBezier(timing.curves.move);
    expect(ease(0.5)).toBeCloseTo(0.5, 9);
    for (let x = 0; x <= 0.5; x += 0.05) {
      expect(ease(x) + ease(1 - x)).toBeCloseTo(1, 6);
    }
  });
});
