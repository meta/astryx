// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file paging.ts
 * @input A release velocity, a settle's start, end and velocity, and the
 *   UIKit paging constants
 * @output Exports `pagingSettleVelocity` (the velocity a settle starts at),
 *   `solvePaging` (UIKit's paging settle as a MotionCurve the animator plays)
 *   and `solveAnimatedPageScroll` (`setContentOffset(_:animated:)`). The page
 *   a release settles on is the pager's own rule, on the motion foundation's
 *   release policy (resolveSnapPoint.ts)
 * @position Pure math; no DOM, no React. Read by hooks/usePager.ts
 *
 * Coordinates: `position` is the content offset along the paging axis in px,
 * 0 at page 0 and growing toward later pages (a pager's track is translated
 * by −position, mirrored in RTL by its owner). Velocities are px/s of that
 * offset, positive toward later pages.
 *
 * The settle is UIKit's own integrator (uikit/paging.ts), run step by step:
 * no closed form reproduces its per-frame stepping, and a release needs at
 * most ~400 steps (well under a millisecond of work), so `solvePaging`
 * integrates once into a table and the curve reads it.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/motion/paging.test.ts
 * - /packages/core/src/motion/README.md
 */

import type {MotionCurve} from './animator';
import {paging} from './uikit/paging';

/**
 * The velocity a paging settle starts at, from the release velocity every
 * gesture reads (the shared tracker's release filter, spec:AST-100): zeroed
 * below `velocityFloor`, paging's own tuning on top of that one velocity
 * (FR3). The page choice reads the release velocity itself.
 */
export function pagingSettleVelocity(velocity: number): number {
  return Math.abs(velocity) < paging.release.velocityFloor ? 0 : velocity;
}

/** A paging settle: the curve and where it ends. */
export interface PagingCurve extends MotionCurve {
  readonly from: number;
  readonly to: number;
  /** Integration steps the settle took. */
  readonly steps: number;
}

/**
 * UIKit's paging settle from `from` (px) moving at `velocity` (px/s) onto
 * `to`: `paging.integrator` stepped `stepsPerSecond` times a second, ending
 * exactly on `to`. The same motion returns an overscrolled pager to its
 * first or last page.
 *
 * The release velocity enters as UIKit hands it to the integrator, in px per
 * millisecond per step; at 960 steps a second the content therefore starts at
 * 96 % of the finger's speed, as it does in UIKit.
 */
export function solvePaging({
  from,
  velocity,
  to,
}: {
  from: number;
  velocity: number;
  to: number;
}): PagingCurve {
  const {springPull, friction, stepsPerSecond, restDistance, restSpeed} =
    paging.integrator;
  const xs: number[] = [from];
  const vs: number[] = [velocity / 1000];
  let x = from;
  let v = velocity / 1000;
  // ~10 s of steps: far beyond any settle (≈ 0.35 s from rest).
  const maxSteps = stepsPerSecond * 10;
  let steps = 0;
  while (steps < maxSteps) {
    if (Math.abs(to - x) < restDistance && Math.abs(v) < restSpeed) {
      break;
    }
    v = (v + (to - x) * springPull) * friction;
    x += v;
    steps += 1;
    xs.push(x);
    vs.push(v);
  }
  xs[xs.length - 1] = to;
  vs[vs.length - 1] = 0;
  const duration = steps / stepsPerSecond;
  const last = xs.length - 1;
  const read = (table: number[], t: number): number => {
    if (!(t > 0)) {
      return table[0];
    }
    const s = t * stepsPerSecond;
    if (s >= last) {
      return table[last];
    }
    const i = Math.floor(s);
    const f = s - i;
    return table[i] + (table[i + 1] - table[i]) * f;
  };
  return {
    from,
    to,
    steps,
    duration,
    at: t => read(xs, t),
    // px per step × steps per second
    velocity: t => read(vs, t) * stepsPerSecond,
  };
}

/**
 * `setContentOffset(_:animated:)`: `paging.animatedScroll.duration` on a
 * sinusoidal ease-in-out, whatever the distance. UIKit starts it from the
 * current offset and drops any velocity, as here.
 */
export function solveAnimatedPageScroll({
  from,
  to,
}: {
  from: number;
  to: number;
}): MotionCurve {
  const {duration} = paging.animatedScroll;
  const distance = to - from;
  return {
    duration,
    at: t => {
      const u = Math.min(1, Math.max(0, t / duration));
      return from + (distance * (1 - Math.cos(Math.PI * u))) / 2;
    },
    velocity: t => {
      if (t <= 0 || t >= duration) {
        return 0;
      }
      return (
        ((distance * Math.PI) / (2 * duration)) *
        Math.sin((Math.PI * t) / duration)
      );
    },
  };
}
