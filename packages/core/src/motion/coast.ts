// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file coast.ts
 * @input An animator, release velocities, and optional edges, deceleration
 *   rate and edge spring
 * @output Exports `coast`, a released scroll view's momentum curves (UIKit's
 *   coast, handing its velocity to an edge spring at a bound) for
 *   `Animator.decay`; `CoastOptions`; and `edgeMotion`, one axis's edge spring
 * @position Motion foundation, pure math over an animator's presentation
 *   values. Only a surface that coasts imports it, so the coast math and the
 *   scroll table stay out of every other caller of the animator.
 *
 * Each property starts at its presentation value (`animator.get`), so a coast
 * continues whatever was running without a jump:
 * - inside its bounds, it coasts at `rate` (decay.ts) and comes to rest where
 *   it projects;
 * - a coast that reaches an edge hands its velocity at the contact to the
 *   edge spring, which settles on the edge;
 * - released past an edge, it springs straight back with the release
 *   velocity: a transition, not momentum, so under Reduce Motion `decay`
 *   plays it as `animate` does, a cross-fade on a coarse pointer or after a
 *   touch release (`touchRelease`) and at once on any other
 *   (`design:reduced-motion` DR2, DR3);
 * - at zero velocity inside its bounds, it rests where it is.
 *
 * SYNC: When modified, update coast.test.ts and DateInput/wheelPhysics.test.ts.
 */

import {
  MAX_DURATION_MS,
  SETTLE_THRESHOLD,
  type Animator,
  type MotionCurve,
} from './animator';
import {solveDecay} from './decay';
import {resolveMotion} from './resolveMotion';
import {
  solveSpring,
  toSpring,
  type Spring,
  type SpringDescription,
} from './spring';
import {registerScrollTable, scroll} from './uikit/scroll';

export interface CoastOptions {
  /** Per-millisecond velocity factor; UIScrollView's normal rate by default. */
  rate?: number;
  /** Edges: a coast crossing one hands its velocity to `bounce`. */
  bounds?: Partial<Record<'x' | 'y', {min: number; max: number}>>;
  /**
   * The edge spring; `scroll.bounce` by default, which plays its table value
   * (it is not a motion role: `spec:AST-094` FR4 lists no scroll spring).
   */
  bounce?: SpringDescription;
  /**
   * The release time on the document timeline (ms, `performance.now()`
   * clock); now by default. Pass the same `at` to `decay`.
   */
  at?: number;
}

/** A curve that holds `end` from `duration` on. */
function settling(
  duration: number,
  end: number,
  at: (t: number) => number,
  velocity: (t: number) => number,
): MotionCurve {
  return {
    duration,
    at: t => (t >= duration ? end : at(t)),
    velocity: t => (t >= duration ? 0 : velocity(t)),
  };
}

/** One axis's motion onto an edge, from t = 0 to `duration` (seconds). */
export interface EdgeMotion {
  /** Seconds until it rests on `to`: the animator's limit at most. */
  readonly duration: number;
  /** The edge it rests on. */
  readonly to: number;
  /** The position at `t` seconds; `to` from `duration` on. */
  value(t: number): number;
  /** The velocity at `t` seconds, per second; 0 from `duration` on. */
  velocity(t: number): number;
}

/** How a release meets the edge. */
interface EdgeMotionOptions {
  /**
   * A return: the edge spring takes the axis straight onto the edge with the
   * release velocity, as after a release past it. Otherwise the axis coasts
   * into the edge first.
   */
  isReturn: boolean;
  /** The coast's per-millisecond velocity factor; UIScrollView's normal. */
  rate?: number;
  /**
   * How near the edge the motion counts as at rest: the animator's threshold
   * for the axis by default.
   */
  threshold?: number;
}

/**
 * One axis released at `from` with `velocity` (per second) toward `edge`, as
 * UIScrollView moves it. A return springs straight onto the edge. A coast runs
 * at `rate` until it reaches the edge, and the spring takes the velocity it
 * has there. A coast that stops short of the edge gives null. The motion
 * rests within `threshold` of the edge, and snaps onto the edge at the
 * animator's limit.
 */
export function edgeMotion(
  axis: 'x' | 'y',
  from: number,
  velocity: number,
  edge: number,
  spring: Spring,
  options: EdgeMotionOptions & {isReturn: true},
): EdgeMotion;
export function edgeMotion(
  axis: 'x' | 'y',
  from: number,
  velocity: number,
  edge: number,
  spring: Spring,
  options: EdgeMotionOptions,
): EdgeMotion | null;
export function edgeMotion(
  axis: 'x' | 'y',
  from: number,
  velocity: number,
  edge: number,
  spring: Spring,
  {
    isReturn,
    rate = scroll.decelerationRate.normal,
    threshold = SETTLE_THRESHOLD[axis],
  }: EdgeMotionOptions,
): EdgeMotion | null {
  const limit = MAX_DURATION_MS / 1000;
  if (isReturn) {
    const back = solveSpring(spring, {from, to: edge, velocity});
    return restingOn(
      edge,
      Math.min(limit, back.settleTime(threshold)),
      t => back.value(t),
      t => back.velocity(t),
    );
  }
  const glide = solveDecay({from, velocity, rate});
  const hit = glide.timeToReach(edge);
  if (hit == null) {
    return null;
  }
  const bounce = solveSpring(spring, {
    from: edge,
    to: edge,
    velocity: glide.velocity(hit),
  });
  return restingOn(
    edge,
    Math.min(limit, hit + bounce.settleTime(threshold)),
    t => (t < hit ? glide.value(t) : bounce.value(t - hit)),
    t => (t < hit ? glide.velocity(t) : bounce.velocity(t - hit)),
  );
}

/** An edge motion that holds `to` from `duration` on. */
function restingOn(
  to: number,
  duration: number,
  value: (t: number) => number,
  velocity: (t: number) => number,
): EdgeMotion {
  return {
    duration,
    to,
    value: t => (t >= duration ? to : value(t)),
    velocity: t => (t >= duration ? 0 : velocity(t)),
  };
}

function asCurve(motion: EdgeMotion): MotionCurve {
  return {
    duration: motion.duration,
    at: t => motion.value(t),
    velocity: t => motion.velocity(t),
  };
}

/**
 * The momentum curves of a release with `velocity` (px per second on each
 * translate axis), for `animator.decay`, which moves only `x` and `y`:
 * momentum continues a finger's throw (design:reduced-motion DR2).
 *
 * @example
 * ```
 * animator.decay(
 *   coast(animator, {x: velocityX}, {bounds: {x: {min: -maxScroll, max: 0}}}),
 * );
 * ```
 */
export function coast(
  animator: Animator,
  velocity: {readonly x?: number; readonly y?: number},
  options: CoastOptions = {},
): Partial<Record<'x' | 'y', MotionCurve>> {
  const velocities: Partial<Record<'x' | 'y', number>> = {};
  for (const key of ['x', 'y'] as const) {
    const value = velocity[key];
    if (value != null && Number.isFinite(value)) {
      velocities[key] = value;
    }
  }
  const rate = options.rate ?? scroll.decelerationRate.normal;
  registerScrollTable();
  const bounce = toSpring(
    resolveMotion(animator.element, options.bounce ?? scroll.bounce),
  );
  const curves: Partial<Record<'x' | 'y', MotionCurve>> = {};
  for (const [key, v0] of Object.entries(velocities) as ['x' | 'y', number][]) {
    const from = animator.get(key, options.at);
    const bounds = options.bounds?.[key];
    const threshold = SETTLE_THRESHOLD[key];
    if (bounds != null && (from < bounds.min || from > bounds.max)) {
      // Released past an edge: straight back with the release velocity.
      const edge = from < bounds.min ? bounds.min : bounds.max;
      curves[key] = {
        ...asCurve(edgeMotion(key, from, v0, edge, bounce, {isReturn: true})),
        // A spring the release starts, not momentum (Reduce Motion: DR2).
        isTransition: true,
      };
      continue;
    }
    const glide = solveDecay({from, velocity: v0, rate});
    const edge =
      bounds == null
        ? null
        : glide.rest < bounds.min
          ? bounds.min
          : glide.rest > bounds.max
            ? bounds.max
            : null;
    // The coast reaches the edge: the edge spring takes its velocity.
    const into =
      edge == null
        ? null
        : edgeMotion(key, from, v0, edge, bounce, {isReturn: false, rate});
    if (into != null) {
      curves[key] = asCurve(into);
    } else if (v0 === 0) {
      curves[key] = settling(
        0,
        from,
        () => from,
        () => 0,
      );
    } else {
      curves[key] = settling(
        glide.settleTime(threshold * 2),
        edge ?? glide.rest,
        t => glide.value(t),
        t => glide.velocity(t),
      );
    }
  }
  return curves;
}
