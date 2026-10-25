// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file progress.ts
 * @input A spring, a normalized progress, an animator's presented velocities
 * @output Exports `progressCurve` (a spring's progress from 0 to 1 as a
 *   MotionCurve), `mapProgress` (one curve as a function of another),
 *   `mapRange` (the clamped linear map most companions use) and
 *   `presentedProgressVelocity` (the progress velocity that continues what
 *   an animator shows)
 * @position Shared by the motion building blocks that move several channels
 *   along one path (the rect morph, rectMorph.ts) and by companion motion (a
 *   scrim's dim following a sheet): one velocity unit, one curve mapping and
 *   one way to continue an interrupted motion
 *
 * A path is described by a normalized progress: 0 where it starts, 1 where
 * it rests, beyond either end on a spring's overshoot. Its velocity is in
 * progress per second; each channel's own velocity stays in the channel's
 * units per second.
 *
 * An interrupted motion continues from what is on screen (laws M2, M3): the
 * block reads the presented values and velocities from the animator at one
 * `now` (`get`, `getVelocity`), restarts a path from those values, and starts
 * its progress with the presented velocity projected on the path's tangent
 * at its start, v·t / (t·t), where t = d(values)/dp. Channels are weighted
 * into one unit first (px per unit of scale, say), so a scale and a
 * translation count alike.
 *
 * A companion follows a driving curve through `mapProgress`, most often
 * with `mapRange`: `mapProgress(sheetY, mapRange([closedY, openY], [0, dim]))`
 * dims a scrim as a sheet rises. Played on another animator, it stays in
 * lockstep only when it starts with its driver: pass the driver's start,
 * `scrim.play({opacity}, {at: start})` with `start = await handle.started`
 * (or one shared `at` for both calls); two calls from rest otherwise each
 * start at their own commit.
 *
 * SYNC: When modified, update /packages/core/src/motion/progress.test.ts and
 * /packages/core/src/motion/README.md.
 */

import type {Animator, MotionCurve, MotionProperty} from './animator';
import {
  SETTLING_EPSILON,
  solveSpring,
  toSpring,
  type SpringDescription,
} from './spring';

/** The step of the finite differences taken on a progress. */
const STEP = 1e-4;

/**
 * The progress of `spring` from 0 to 1, starting with `velocity` (progress
 * per second): exactly 1 once it settles within `epsilon`.
 */
export function progressCurve(
  spring: SpringDescription,
  {
    velocity = 0,
    epsilon = SETTLING_EPSILON,
  }: {velocity?: number; epsilon?: number} = {},
): MotionCurve {
  const curve = solveSpring(toSpring(spring), {from: 0, to: 1, velocity});
  const duration = curve.settleTime(epsilon);
  return {
    duration,
    at: t => (t >= duration ? 1 : curve.value(t)),
    velocity: t => (t >= duration ? 0 : curve.velocity(t)),
  };
}

/**
 * The curve of `f(driver(t))`, its velocity by the chain rule: a channel
 * following a path as its progress moves, or a companion following any
 * driving curve (a sheet's `y` mapped onto its scrim's opacity). The driver
 * is any MotionCurve, not only a progress from 0 to 1. A companion played on
 * another animator starts with its driver (`{at: start}`; see the file
 * header).
 */
export function mapProgress(
  driver: MotionCurve,
  f: (value: number) => number,
): MotionCurve {
  return {
    duration: driver.duration,
    at: t => f(driver.at(t)),
    velocity: t => {
      const value = driver.at(t);
      return (
        ((f(value + STEP) - f(value - STEP)) / (2 * STEP)) * driver.velocity(t)
      );
    },
  };
}

/**
 * The linear map from `input` to `output`, held at `output`'s ends outside
 * `input` unless `clamp` is false: what most companions are (a scrim's dim
 * along a sheet's travel, a parallax, a dismissal's fade). Either range may
 * run backward (`[openY, closedY]`).
 */
export function mapRange(
  input: readonly [number, number],
  output: readonly [number, number],
  {clamp = true}: {clamp?: boolean} = {},
): (x: number) => number {
  const [a, b] = input;
  const [c, d] = output;
  return x => {
    let t = a === b ? (x < a ? 0 : 1) : (x - a) / (b - a);
    if (clamp) {
      t = Math.min(1, Math.max(0, t));
    }
    // Exact at both ends.
    return t === 0 ? c : t === 1 ? d : c + (d - c) * t;
  };
}

/**
 * One channel of a path: an animator property and its value at each
 * progress.
 */
export interface ProgressChannel {
  readonly property: MotionProperty;
  /** The property's value at progress `p`. */
  at(p: number): number;
  /**
   * What one unit of the property weighs in the projection, in a unit the
   * channels share (px per unit of scale for a box `weight` px wide). 1 by
   * default.
   */
  readonly weight?: number;
}

/**
 * The progress velocity, per second, that continues what `animator`
 * presents at `now` along a path that starts there: the presented velocity
 * projected on the path's tangent at progress 0, v·t / (t·t). 0 when the
 * path does not move any of its channels.
 */
export function presentedProgressVelocity(
  animator: Pick<Animator, 'getVelocity'>,
  channels: ReadonlyArray<ProgressChannel>,
  now?: number,
): number {
  let along = 0;
  let squared = 0;
  for (const channel of channels) {
    const weight = channel.weight ?? 1;
    const tangent = ((channel.at(STEP) - channel.at(0)) / STEP) * weight;
    along += animator.getVelocity(channel.property, now) * weight * tangent;
    squared += tangent * tangent;
  }
  return squared > 1e-12 ? along / squared : 0;
}
