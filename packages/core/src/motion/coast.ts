// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file coast.ts
 * @input An animator, release velocities, and optional edges, deceleration
 *   rate and edge spring
 * @output Exports `coast`: the momentum curves of a released scroll view
 *   (UIScrollView's coast, handing its velocity to an edge spring at a bound)
 *   for `Animator.decay` to play; and its `CoastOptions`
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
 *   plays it as `animate` does, a cross-fade on a coarse pointer and at once
 *   on any other (`design:reduced-motion` DR2, DR3);
 * - at zero velocity inside its bounds, it rests where it is.
 *
 * SYNC: When modified, update coast.test.ts.
 */

import {
  SETTLE_THRESHOLD,
  type Animator,
  type MotionCurve,
  type MotionProperty,
  type MotionValues,
} from './animator';
import {solveDecay} from './decay';
import {solveSpring, toSpring, type SpringDescription} from './spring';
import {scroll} from './uikit/scroll';

export interface CoastOptions {
  /** Per-millisecond velocity factor; UIScrollView's normal rate by default. */
  rate?: number;
  /** Edges: a coast crossing one hands its velocity to `bounce`. */
  bounds?: Partial<Record<MotionProperty, {min: number; max: number}>>;
  /** The edge spring; `scroll.bounce` by default. */
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

/**
 * The momentum curves of a release with `velocity` (units per second for
 * each property; `scale` sets both scales), for `animator.decay`.
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
  velocity: MotionValues,
  options: CoastOptions = {},
): Partial<Record<MotionProperty, MotionCurve>> {
  const known = Object.keys(SETTLE_THRESHOLD) as MotionProperty[];
  const velocities: Partial<Record<MotionProperty, number>> = {};
  for (const [key, value] of Object.entries(velocity)) {
    if (value == null || !Number.isFinite(value)) {
      continue;
    }
    if (key === 'scale') {
      velocities.scaleX ??= value;
      velocities.scaleY ??= value;
    } else if ((known as ReadonlyArray<string>).includes(key)) {
      velocities[key as MotionProperty] = value;
    }
  }
  const rate = options.rate ?? scroll.decelerationRate.normal;
  const bounce = toSpring(options.bounce ?? scroll.bounce);
  const curves: Partial<Record<MotionProperty, MotionCurve>> = {};
  for (const [key, v0] of Object.entries(velocities) as [
    MotionProperty,
    number,
  ][]) {
    const from = animator.get(key, options.at);
    const bounds = options.bounds?.[key];
    const threshold = SETTLE_THRESHOLD[key];
    if (bounds != null && (from < bounds.min || from > bounds.max)) {
      // Released past an edge: straight back with the release velocity.
      const edge = from < bounds.min ? bounds.min : bounds.max;
      const back = solveSpring(bounce, {from, to: edge, velocity: v0});
      curves[key] = {
        ...settling(
          back.settleTime(threshold),
          edge,
          t => back.value(t),
          t => back.velocity(t),
        ),
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
    const hit = edge == null ? null : glide.timeToReach(edge);
    if (edge != null && hit != null) {
      // The coast reaches the edge: the edge spring takes its velocity.
      const spring = solveSpring(bounce, {
        from: edge,
        to: edge,
        velocity: glide.velocity(hit),
      });
      curves[key] = settling(
        hit + spring.settleTime(threshold),
        edge,
        t => (t < hit ? glide.value(t) : spring.value(t - hit)),
        t => (t < hit ? glide.velocity(t) : spring.velocity(t - hit)),
      );
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
