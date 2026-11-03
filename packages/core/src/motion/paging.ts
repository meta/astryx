// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file paging.ts
 * @input A release velocity, a settle's start, end and velocity, and the UIKit
 *   paging constants
 * @output Exports `pagingSettleVelocity`, `solvePaging` (UIKit's paging settle
 *   as a curve the animator plays) and `solveAnimatedPageScroll`
 * @position Pure math, with no DOM and no React
 *
 * SYNC: When modified, update:
 * - /packages/core/src/motion/paging.test.ts
 * - /packages/core/src/motion/README.md
 */

import type {MotionCurve} from './animator';
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
