// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file decay.ts
 * @input A release value, velocity and a UIScrollView deceleration rate
 * @output Exports `solveDecay`, the closed-form momentum coast of a scroll
 *   view after the finger lifts (value, velocity, rest point, settle time,
 *   time to reach a value), and `decayRestDistance`
 * @position Pure math under the motion animator; no DOM, no React
 *
 * UIScrollView's deceleration rate is a per-millisecond velocity factor: the
 * speed is multiplied by the rate every millisecond (0.998 normal, 0.99 fast;
 * see uikit/scroll.ts). As a continuous decay that is
 *   v(t) = v₀·e^(−λt),  x(t) = x₀ + v₀·(1 − e^(−λt)) ÷ λ,  λ = −1000·ln(rate) /s
 * and the coast ends at x₀ + v₀ ÷ λ. WWDC18 "Designing Fluid Interfaces"
 * projects the same rest point with the geometric series v₀·rate ÷ (1 − rate)
 * per millisecond (projection.ts), 0.1 % shorter at the normal rate (499.0
 * against 499.5 ms of the release speed); the continuous form is the one
 * that also gives the position and velocity at every instant, which the
 * animator needs to grab a coasting surface mid-flight.
 *
 * Units: time in seconds, velocity in units per second.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/motion/decay.test.ts
 * - /packages/core/src/motion/README.md
 */

import {scroll} from './uikit/scroll';

/** A coast released at `from` with `initialVelocity`. */
export interface DecayCurve {
  readonly from: number;
  /** Units per second. */
  readonly initialVelocity: number;
  /** Per-millisecond velocity factor. */
  readonly rate: number;
  /** Where the coast comes to rest. */
  readonly rest: number;
  /** Value `t` seconds after release. */
  value(t: number): number;
  /** Velocity `t` seconds after release, units/s. */
  velocity(t: number): number;
  /** Seconds until the value is within `threshold` of `rest` for good. */
  settleTime(threshold: number): number;
  /** Seconds until the speed falls to `speed` units/s (0 if already slower). */
  timeToSpeed(speed: number): number;
  /**
   * Seconds until the coast reaches `target`, or null when it never gets
   * there (behind the release point, or at or past the rest point).
   */
  timeToReach(target: number): number | null;
}

function decayConstant(rate: number): number {
  if (!(rate > 0 && rate < 1)) {
    throw new RangeError(`decay: rate must be in (0, 1), got ${rate}`);
  }
  return -1000 * Math.log(rate);
}

/** How far a coast at `velocity` units/s travels before it stops. */
export function decayRestDistance(
  velocity: number,
  rate: number = scroll.decelerationRate.normal,
): number {
  return velocity / decayConstant(rate);
}

/**
 * The momentum coast UIScrollView performs after the finger lifts.
 *
 * @example
 * ```
 * const coast = solveDecay({from: 0, velocity: 2000});
 * coast.rest; // ≈ 999 px
 * coast.value(0.2); // px after 200 ms
 * ```
 */
export function solveDecay({
  from,
  velocity: initialVelocity,
  rate = scroll.decelerationRate.normal,
}: {
  from: number;
  velocity: number;
  rate?: number;
}): DecayCurve {
  const lambda = decayConstant(rate);
  const rest = from + initialVelocity / lambda;
  const speed0 = Math.abs(initialVelocity);
  return {
    from,
    initialVelocity,
    rate,
    rest,
    value: t => from + (initialVelocity * -Math.expm1(-lambda * t)) / lambda,
    velocity: t => initialVelocity * Math.exp(-lambda * t),
    settleTime: threshold => {
      const remaining = speed0 / lambda;
      if (!(threshold > 0)) {
        return Infinity;
      }
      return remaining <= threshold
        ? 0
        : Math.log(remaining / threshold) / lambda;
    },
    timeToSpeed: speed =>
      speed0 <= speed
        ? 0
        : speed > 0
          ? Math.log(speed0 / speed) / lambda
          : Infinity,
    timeToReach: target => {
      if (initialVelocity === 0) {
        return target === from ? 0 : null;
      }
      // 1 − e^(−λt) = λ·(target − from) ÷ v₀
      const fraction = (lambda * (target - from)) / initialVelocity;
      if (fraction < 0 || fraction >= 1) {
        return null;
      }
      return -Math.log1p(-fraction) / lambda;
    },
  };
}
