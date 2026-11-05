// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file bezier.ts
 * @input Cubic-bézier control points [x1, y1, x2, y2]
 * @output Exports `cubicBezier`, the timing function CSS and Core Animation
 *   define by those points (progress → eased progress)
 * @position Pure math under the animator (the Reduced Motion cross-fade runs
 *   on Core Animation's named curves); no DOM, no React
 *
 * The curve runs from (0, 0) to (1, 1) with the two given control points;
 * x is time, y is progress. Solved for x by Newton's method with a bisection
 * fallback, the approach browser engines use for CSS `cubic-bezier()`.
 *
 * SYNC: When modified, update /packages/core/src/motion/bezier.test.ts
 */

export type BezierPoints = readonly [number, number, number, number];

/** The timing function for `points`: maps time progress to eased progress. */
export function cubicBezier([x1, y1, x2, y2]: BezierPoints): (
  x: number,
) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  const solveT = (x: number) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const error = sampleX(t) - x;
      if (Math.abs(error) < 1e-7) {
        return t;
      }
      const slope = slopeX(t);
      if (Math.abs(slope) < 1e-6) {
        break;
      }
      t -= error / slope;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 60; i++) {
      const value = sampleX(t);
      if (Math.abs(value - x) < 1e-7) {
        break;
      }
      if (value < x) {
        lo = t;
      } else {
        hi = t;
      }
      t = (lo + hi) / 2;
    }
    return t;
  };
  return x => (x <= 0 ? 0 : x >= 1 ? 1 : sampleY(solveT(x)));
}
