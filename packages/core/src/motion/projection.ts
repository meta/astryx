// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file projection.ts
 * @input A release position and velocity, candidate rest points
 * @output Exports `projectDistance` / `project` (WWDC18's momentum
 *   projection) and `selectSnapPoint` (the release target UIKit-style)
 * @position Pure math; no DOM, no React
 *
 * WWDC18 "Designing Fluid Interfaces" (session 803): a thrown object goes to
 * the endpoint nearest to where it WOULD coast if it were scrolled, not the
 * endpoint nearest to where the finger let go. The talk's projection
 * function, verbatim in units/s:
 *
 *   func project(initialVelocity: CGFloat, decelerationRate: CGFloat) -> CGFloat {
 *     return (initialVelocity / 1000.0) * decelerationRate / (1.0 - decelerationRate)
 *   }
 *
 * used with `UIScrollView.DecelerationRate.normal`. A slow release projects
 * onto itself, so it places; a flick continues past the finger.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/motion/projection.test.ts
 * - /packages/core/src/motion/README.md
 */

import {scroll} from './uikit/scroll';

/** Distance a surface released at `velocity` units/s coasts (WWDC18). */
export function projectDistance(
  velocity: number,
  rate: number = scroll.decelerationRate.normal,
): number {
  if (!(rate > 0 && rate < 1)) {
    throw new RangeError(`projection: rate must be in (0, 1), got ${rate}`);
  }
  return ((velocity / 1000) * rate) / (1 - rate);
}

/** Where a surface released at `position` with `velocity` would come to rest. */
export function project(
  position: number,
  velocity: number,
  rate: number = scroll.decelerationRate.normal,
): number {
  return position + projectDistance(velocity, rate);
}

export interface SnapSelection {
  /** Index of the chosen point in the list passed in. */
  readonly index: number;
  /** The chosen point. */
  readonly value: number;
  /** The projected rest position the choice was made from. */
  readonly projected: number;
}

/**
 * The rest point a release goes to: the one nearest the projected rest
 * position. This is the math primitive (projection + nearest); the release
 * policy on top of it (a flick advances at least one detent, a release moving
 * back toward its start cancels) is `resolveSnapPoint` (resolveSnapPoint.ts), so a
 * component's release rule calls that rather than adding its own. `fromIndex` + `maxSteps` limit how many points away from the
 * starting one a single release may travel (by index order; pass points
 * sorted along the axis). Ties go to the point in the direction of travel.
 *
 * @example
 * ```
 * // A sheet with detents at 0, 300 and 600 px, released at 320 px moving
 * // 900 px/s toward 600: projected ≈ 769 → 600.
 * selectSnapPoint([0, 300, 600], {position: 320, velocity: 900});
 * ```
 */
export function selectSnapPoint(
  points: ReadonlyArray<number>,
  {
    position,
    velocity,
    rate = scroll.decelerationRate.normal,
    fromIndex,
    maxSteps,
  }: {
    position: number;
    velocity: number;
    rate?: number;
    fromIndex?: number;
    maxSteps?: number;
  },
): SnapSelection {
  if (points.length === 0) {
    throw new RangeError(
      'projection: selectSnapPoint needs at least one point',
    );
  }
  const projected = project(position, velocity, rate);
  let lo = 0;
  let hi = points.length - 1;
  if (fromIndex != null && maxSteps != null) {
    // A stale index past either end counts from the nearest real point.
    const from = Math.min(Math.max(fromIndex, 0), points.length - 1);
    lo = Math.max(lo, from - maxSteps);
    hi = Math.min(hi, from + maxSteps);
  }
  let best = lo;
  let bestDistance = Infinity;
  for (let i = lo; i <= hi; i++) {
    const distance = Math.abs(points[i] - projected);
    const isTie = Math.abs(distance - bestDistance) < 1e-9;
    const isAhead = Math.sign(points[i] - points[best]) === Math.sign(velocity);
    if (distance < bestDistance - 1e-9 || (isTie && isAhead)) {
      best = i;
      bestDistance = distance;
    }
  }
  return {index: best, value: points[best], projected};
}
