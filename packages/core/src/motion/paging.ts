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
import {cubicBezier, type BezierPoints} from './bezier';
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
 * `setContentOffset(_:animated:)`: `paging.animatedScroll.durationMs` on its
 * curve (the sinusoidal ease-in-out as a cubic bézier), whatever the
 * distance, from the current offset. The pager passes the duration and curve
 * it reads through `resolveMotion` (`spec:AST-094` FR4): the table's measured
 * values, as FR4 names neither as a role.
 *
 * `velocity` (px/s) is that of a move this one retargets: the new curve
 * starts at it and still ends on `to`, at rest, on time (`spec:AST-094` FR6:
 * a new target keeps the current velocity; UIKit drops it). The carry is a
 * Hermite term, v × duration × u(1 − u)², less the curve's own starting
 * slope, so a move from rest is the curve itself.
 */
export function solveAnimatedPageScroll({
  from,
  to,
  durationMs = paging.animatedScroll.durationMs,
  curve = paging.animatedScroll.curve,
  velocity,
}: {
  from: number;
  to: number;
  durationMs?: number;
  curve?: BezierPoints;
  velocity?: number;
}): MotionCurve {
  const duration = durationMs / 1000;
  const distance = to - from;
  const ease = cubicBezier(curve);
  const progress = (u: number) => ease(Math.min(1, Math.max(0, u)));
  // The carry, in px: the retargeted velocity over the whole duration, less
  // what the curve's own starting slope already gives.
  const startSlope = progress(1e-4) / 1e-4;
  const carry =
    velocity == null ? 0 : velocity * duration - distance * startSlope;
  const at = (t: number) => {
    const u = Math.min(1, Math.max(0, t / duration));
    return from + distance * progress(u) + carry * u * (1 - u) * (1 - u);
  };
  return {
    duration,
    at,
    velocity: t => {
      if (t <= 0) {
        return velocity ?? 0;
      }
      if (t >= duration) {
        return 0;
      }
      const h = Math.min(1e-4, t / 2, (duration - t) / 2);
      return (at(t + h) - at(t - h)) / (2 * h);
    },
  };
}
