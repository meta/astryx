// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file resolveSnapPoint.ts
 * @input A release (position and velocity on one axis), the points it can
 *   land on, and the release policy's thresholds
 * @output Exports resolveSnapPoint: the index of the snap point a release lands on,
 *   and the projected rest position it was judged from
 * @position The release policy of the motion foundation, on
 *   `selectSnapPoint` (projection.ts), which stays the math primitive
 *   (projection + nearest). Pure: no DOM, no React. Internal to core: not
 *   exported from the package or any barrel (resolveSnapPoint.test.ts locks
 *   that). A component's release rule calls it with its own points and
 *   thresholds; this is the one "where does a release land" helper, so a
 *   second one should not be added beside it.
 *
 * - A slow release lands on the snap point nearest where it would come to rest:
 *   its position, or, with `projection`, its position plus the distance it
 *   would coast at its velocity (projection.ts). Below
 *   `projection.minSpeed` nothing is projected, so it lands on the snap point
 *   nearest where it was let go. A tie goes the way a projected release
 *   moves, and otherwise to the earlier snap point (`selectSnapPoint`).
 * - A flick (`flickThreshold` or faster) lands at least on the next snap point
 *   beyond its position in the direction it moves, or on the nearest
 *   snap point to its projection if that is farther. A snap point within
 *   `tolerance` of the position counts as reached, so the flick goes on to
 *   the one after it.
 * - With `start` (where the drag began), a release moving back toward it
 *   cancels to the snap point nearest `start`, whatever its travel so far or its
 *   speed.
 * - With `fromIndex` and `maxSteps`, a release lands at most `maxSteps`
 *   points away from the one at `fromIndex` (a pager's one page per
 *   release).
 *
 * Snap points are ascending positions on the axis; velocities are in the same
 * units per second, positive toward larger positions.
 *
 * SYNC: When modified, update resolveSnapPoint.test.ts.
 */

import {selectSnapPoint} from './projection';

/** Where a release lands. */
export interface SnapPointRelease {
  /** Index into the points passed in. */
  readonly index: number;
  /** The rest position the choice was judged from (the position without a projection). */
  readonly projected: number;
}

/** A release's projection: how far ahead it is judged, and from what speed. */
export interface SnapPointProjection {
  /** Seconds of the release velocity the projection reaches. */
  readonly seconds: number;
  /** Below this speed (units/s), nothing is projected (default 0). */
  readonly minSpeed?: number;
}

/** The deceleration rate whose projection reaches `seconds` of the velocity. */
function rateForProjection(seconds: number): number {
  // WWDC18's projection coasts (v / 1000) · r / (1 − r): r / (1 − r) = 1000·τ.
  const ms = seconds * 1000;
  return ms / (1 + ms);
}

/** The index of the snap point nearest `position` (the first on a tie). */
function nearestIndex(points: ReadonlyArray<number>, position: number): number {
  let best = 0;
  for (let i = 1; i < points.length; i += 1) {
    if (Math.abs(points[i] - position) < Math.abs(points[best] - position)) {
      best = i;
    }
  }
  return best;
}

/**
 * The snap point a release lands on.
 *
 * @example
 * ```
 * // Snap points at 0, 300 and 640 px. Released at 300 px moving toward 640 at
 * // 1200 px/s, a flick: on to 640, although its projection (420 px) is
 * // nearer 300.
 * resolveSnapPoint({
 *   points: [0, 300, 640],
 *   position: 300,
 *   velocity: 1200,
 *   flickThreshold: 1008,
 *   tolerance: 1,
 *   projection: {seconds: 0.1, minSpeed: 250},
 *   start: 0,
 * }); // {index: 2, projected: 420}
 * ```
 */
export function resolveSnapPoint({
  points,
  position,
  velocity,
  flickThreshold,
  tolerance = 0,
  projection,
  start,
  fromIndex,
  maxSteps,
}: {
  /** Snap point positions, ascending. */
  points: ReadonlyArray<number>;
  position: number;
  velocity: number;
  /** From this speed (units/s) on, a release is a flick. */
  flickThreshold: number;
  /** A snap point this close to the position counts as reached by a flick. */
  tolerance?: number;
  /** Judge a slow release where it would coast to; absent, where it was let go. */
  projection?: SnapPointProjection;
  /** Where the drag began: a release moving back toward it cancels to it. */
  start?: number;
  /** The snap point the release starts from, for `maxSteps`. */
  fromIndex?: number;
  /** At most this many points away from `fromIndex`. */
  maxSteps?: number;
}): SnapPointRelease {
  if (points.length === 0) {
    throw new RangeError('resolveSnapPoint needs at least one snap point');
  }
  const projectedVelocity =
    projection == null || Math.abs(velocity) < (projection.minSpeed ?? 0)
      ? 0
      : velocity;
  const choice = selectSnapPoint(points, {
    position,
    velocity: projectedVelocity,
    rate:
      projection == null ? undefined : rateForProjection(projection.seconds),
    fromIndex,
    maxSteps,
  });
  let index = choice.index;
  if (Math.abs(velocity) >= flickThreshold) {
    // A flick goes at least to the next snap point beyond where it is.
    let next = -1;
    if (velocity > 0) {
      next = points.findIndex(d => d > position + tolerance);
    } else {
      for (let i = points.length - 1; i >= 0 && next === -1; i -= 1) {
        if (points[i] < position - tolerance) {
          next = i;
        }
      }
    }
    if (next !== -1 && (velocity > 0 ? next > index : next < index)) {
      index = next;
    }
  }
  if (
    start != null &&
    velocity !== 0 &&
    Math.sign(velocity) === Math.sign(start - position)
  ) {
    index = nearestIndex(points, start);
  }
  if (fromIndex != null && maxSteps != null) {
    // A stale index past either end counts from the nearest real snap point.
    const from = Math.min(Math.max(fromIndex, 0), points.length - 1);
    index = Math.min(Math.max(index, from - maxSteps), from + maxSteps);
  }
  return {index, projected: choice.projected};
}
