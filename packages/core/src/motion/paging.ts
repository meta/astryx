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
import type {BezierPoints} from './bezier';
import {timedCurve} from './progress';
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
 *
 * At a theme's `tempo`, each step lasts tempo times as long and carries tempo
 * times the release's distance. So a settle from rest keeps its shape and
 * takes tempo times as long, and a release still starts at 96 % of the
 * finger's speed. At tempo 1 the settle is the measured one.
 */
export function solvePaging({
  from,
  velocity,
  to,
  tempo = 1,
}: {
  from: number;
  velocity: number;
  to: number;
  /** The tempo of the theme the motion plays in (themeTempo.ts). */
  tempo?: number;
}): PagingCurve {
  const {springPull, friction, restDistance, restSpeed} = paging.integrator;
  const pace = Number.isFinite(tempo) && tempo > 0 ? tempo : 1;
  const stepsPerSecond = paging.integrator.stepsPerSecond / pace;
  const startVelocity = (velocity / 1000) * pace;
  const xs: number[] = [from];
  const vs: number[] = [startVelocity];
  let x = from;
  let v = startVelocity;
  // ~10 s of steps at tempo 1: far beyond any settle (≈ 0.35 s from rest).
  const maxSteps = paging.integrator.stepsPerSecond * 10;
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
 * curve starts at it and still ends on `to`, at rest and on time
 * (`timedCurve`): a new target keeps the current velocity, where UIKit drops
 * it.
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
  return timedCurve({from, to, durationMs, easing: curve, velocity});
}
