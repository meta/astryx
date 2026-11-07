// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file paging.ts
 * @input A release velocity, a settle's start, end and velocity, and the UIKit
 *   paging constants
 * @output Exports `pagingSettleVelocity`, `solvePaging` (UIKit's paging settle
 *   as a curve the animator plays) and `solveAnimatedPageScroll`
 * @position Pure math, with no DOM and no React; hooks/usePager.ts reads it
 *
 * SYNC: When modified, update:
 * - /packages/core/src/motion/paging.test.ts
 * - /packages/core/src/motion/README.md
 */

import type {MotionCurve} from './animator';
import {cubicBezier, type BezierPoints} from './bezier';
import {paging} from './uikit/paging';

/**
 * The velocity a paging settle starts at. It is the release velocity that every
 * gesture reads, zeroed below `velocityFloor`. The page choice reads the
 * release velocity itself.
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
 * UIKit's paging settle from `from` (px), moving at `velocity` (px/s), onto
 * `to`. It steps `paging.integrator` `stepsPerSecond` times a second and ends
 * exactly on `to`. The same motion returns an overscrolled pager to its first
 * or last page.
 *
 * Positions are content offsets along the paging axis, 0 at page 0 and growing
 * toward later pages. Velocities are px/s of that offset.
 *
 * No closed form reproduces the per-frame stepping, so the settle integrates
 * once into a table, and the curve reads the table. A release needs at most
 * about 400 steps, well under a millisecond of work.
 *
 * The release velocity enters in px per millisecond per step, as UIKit hands it
 * to the integrator. At 960 steps a second, the content starts at 96 % of the
 * finger's speed, as in UIKit.
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
 * curve, from the current offset, at any distance. The pager passes the
 * duration and curve that `resolveMotion` gives, which are the measured values
 * of the table.
 *
 * `velocity` (px/s) is the velocity of a move that this one retargets. The new
 * curve starts at it and still ends on `to`, at rest and on time. A new target
 * keeps the current velocity, where UIKit drops it. The carry is a Hermite
 * term, v × duration × u(1 − u)², less the curve's own starting slope. So a
 * move from rest is the curve itself.
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
