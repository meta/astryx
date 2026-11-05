// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file math.ts
 * @input Nothing: pure functions
 * @output Test oracles for motion: `cubicBezier`, `springStep` (SwiftUI
 *   response / dampingFraction semantics, with initial velocity),
 *   `projectDecay` (UIScrollView deceleration), `rubberBand` (UIKit's
 *   formula), `parseTransform`, `velocityAt`, and curve comparison helpers.
 * @position Imported by the browser helpers and by the specs that compare a
 *   sampled curve against an expected one. Deliberately independent of the
 *   motion code under test in packages/core: an oracle that shares code with
 *   the implementation cannot catch the implementation's mistakes.
 *
 * Units: time in milliseconds, distance in CSS px (= points), velocity in
 * px/s unless a name says otherwise. Spring progress is unitless (0 -> 1).
 *
 * SYNC: Keep ./math.test.ts covering every export.
 */

/** A CSS `cubic-bezier(x1, y1, x2, y2)` timing function: progress in, eased progress out. */
export function cubicBezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): (progress: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (s: number) => ((ax * s + bx) * s + cx) * s;
  const sampleY = (s: number) => ((ay * s + by) * s + cy) * s;
  const slopeX = (s: number) => (3 * ax * s + 2 * bx) * s + cx;
  return progress => {
    if (progress <= 0) {
      return 0;
    }
    if (progress >= 1) {
      return 1;
    }
    // Newton first (fast, converges for well-behaved curves), bisection as the fallback.
    let s = progress;
    for (let i = 0; i < 8; i += 1) {
      const error = sampleX(s) - progress;
      if (Math.abs(error) < 1e-7) {
        return sampleY(s);
      }
      const slope = slopeX(s);
      if (Math.abs(slope) < 1e-6) {
        break;
      }
      s -= error / slope;
    }
    let lo = 0;
    let hi = 1;
    s = progress;
    for (let i = 0; i < 64; i += 1) {
      const x = sampleX(s);
      if (Math.abs(x - progress) < 1e-7) {
        break;
      }
      if (x < progress) {
        lo = s;
      } else {
        hi = s;
      }
      s = (lo + hi) / 2;
    }
    return sampleY(s);
  };
}

/** Parses `cubic-bezier(a, b, c, d)` or one of the CSS keywords into a timing function. */
export function timingFunction(css: string): (progress: number) => number {
  const named: Record<string, [number, number, number, number]> = {
    ease: [0.25, 0.1, 0.25, 1],
    'ease-in': [0.42, 0, 1, 1],
    'ease-out': [0, 0, 0.58, 1],
    'ease-in-out': [0.42, 0, 0.58, 1],
  };
  const value = css.trim();
  if (value === 'linear') {
    return progress => Math.min(1, Math.max(0, progress));
  }
  const match = /^cubic-bezier\(([^)]+)\)$/.exec(value);
  const parts = match
    ? match[1].split(',').map(Number)
    : (named[value] as number[] | undefined);
  if (parts == null || parts.length !== 4 || parts.some(Number.isNaN)) {
    throw new Error(`unsupported timing function: ${css}`);
  }
  return cubicBezier(parts[0], parts[1], parts[2], parts[3]);
}

export interface SpringParameters {
  /** SwiftUI `response`: the period of the undamped spring, in seconds. */
  readonly response: number;
  /** SwiftUI `dampingFraction` (UIKit `dampingRatio`): 1 = critical, < 1 bounces. */
  readonly dampingFraction: number;
  /**
   * Initial velocity in progress units per second, UIKit's `initialVelocity`
   * convention: release velocity (px/s) divided by the distance to travel (px).
   */
  readonly initialVelocity?: number;
}

/**
 * Progress (0 -> 1, may overshoot) of a spring released from rest-or-moving at
 * progress 0 towards 1, after `timeMs`. Mass 1, stiffness (2π/response)²,
 * damping 4π·dampingFraction/response: SwiftUI's mapping.
 */
export function springStep(
  {response, dampingFraction, initialVelocity = 0}: SpringParameters,
  timeMs: number,
): number {
  if (timeMs <= 0) {
    return 0;
  }
  const t = timeMs / 1000;
  const w0 = (2 * Math.PI) / response;
  const z = dampingFraction;
  // y = x - 1: displacement from the target, y(0) = -1, y'(0) = v0.
  const v0 = initialVelocity;
  let y: number;
  if (Math.abs(z - 1) < 1e-9) {
    y = Math.exp(-w0 * t) * (-1 + (v0 - w0) * t);
  } else if (z < 1) {
    const wd = w0 * Math.sqrt(1 - z * z);
    const b = (v0 - z * w0) / wd;
    y = Math.exp(-z * w0 * t) * (-Math.cos(wd * t) + b * Math.sin(wd * t));
  } else {
    const root = Math.sqrt(z * z - 1);
    const r1 = -w0 * (z - root);
    const r2 = -w0 * (z + root);
    const c1 = (v0 + r2) / (r1 - r2);
    const c2 = -1 - c1;
    y = c1 * Math.exp(r1 * t) + c2 * Math.exp(r2 * t);
  }
  return 1 + y;
}

/**
 * Where a surface released at `velocity` px/s comes to rest, relative to the
 * release point, under UIScrollView deceleration (`rate` per millisecond:
 * 0.998 normal, 0.99 fast). UIKit's own projection formula.
 */
export function projectDecay(velocity: number, rate = 0.998): number {
  return ((velocity / 1000) * rate) / (1 - rate);
}

/** UIKit's rubber band: `(1 - 1 / (x * c / d + 1)) * d`, c = 0.55. */
export function rubberBand(
  offset: number,
  dimension: number,
  constant = 0.55,
): number {
  const sign = Math.sign(offset);
  const x = Math.abs(offset);
  return sign * (1 - 1 / ((x * constant) / dimension + 1)) * dimension;
}

export interface Transform2D {
  readonly translateX: number;
  readonly translateY: number;
  readonly scaleX: number;
  readonly scaleY: number;
  /** Rotation in degrees. */
  readonly rotate: number;
}

const IDENTITY: Transform2D = {
  translateX: 0,
  translateY: 0,
  scaleX: 1,
  scaleY: 1,
  rotate: 0,
};

/** Decomposes a computed `transform` (`none`, `matrix(...)`, `matrix3d(...)`) into 2D parts. */
export function parseTransform(css: string): Transform2D {
  const value = css.trim();
  if (value === '' || value === 'none') {
    return IDENTITY;
  }
  const match = /^matrix(3d)?\(([^)]+)\)$/.exec(value);
  if (match == null) {
    throw new Error(`not a computed transform: ${css}`);
  }
  const n = match[2].split(',').map(Number);
  const [a, b, c, d, e, f] = match[1]
    ? [n[0], n[1], n[4], n[5], n[12], n[13]]
    : n;
  const scaleX = Math.hypot(a, b);
  const rotate = (Math.atan2(b, a) * 180) / Math.PI;
  const scaleY = (a * d - b * c) / (scaleX || 1);
  return {translateX: e, translateY: f, scaleX, scaleY, rotate};
}

export interface TimedValue {
  /** Milliseconds. */
  readonly t: number;
  readonly value: number;
}

/**
 * Velocity (units/s) at the end of `samples`, by least squares over the last
 * `windowMs`, the way a release velocity is judged: one slow sample before the
 * lift must not cancel a throw, and a finger that rested has no velocity.
 */
export function velocityAt(
  samples: readonly TimedValue[],
  endMs: number,
  windowMs = 100,
): number {
  const recent = samples.filter(s => s.t <= endMs && s.t >= endMs - windowMs);
  if (recent.length < 2) {
    return 0;
  }
  const meanT = recent.reduce((sum, s) => sum + s.t, 0) / recent.length;
  const meanV = recent.reduce((sum, s) => sum + s.value, 0) / recent.length;
  let num = 0;
  let den = 0;
  for (const s of recent) {
    num += (s.t - meanT) * (s.value - meanV);
    den += (s.t - meanT) ** 2;
  }
  return den === 0 ? 0 : (num / den) * 1000;
}

export interface CurveComparison {
  readonly pass: boolean;
  readonly tolerance: number;
  readonly maxError: number;
  readonly rmsError: number;
  readonly worst: {
    readonly t: number;
    readonly actual: number;
    readonly expected: number;
  };
  readonly points: readonly {
    readonly t: number;
    readonly actual: number;
    readonly expected: number;
  }[];
}

/** Compares sampled values with an expected curve, point by point. */
export function compareCurve(
  samples: readonly TimedValue[],
  expected: (timeMs: number) => number,
  tolerance: number,
): CurveComparison {
  if (samples.length === 0) {
    throw new Error('compareCurve: no samples');
  }
  const points = samples.map(s => ({
    t: s.t,
    actual: s.value,
    expected: expected(s.t),
  }));
  // A point that cannot be compared (a missing reference value, an oracle
  // with a NaN parameter) is a failure, never a pass.
  const errorOf = (p: (typeof points)[number]) =>
    Number.isFinite(p.actual) && Number.isFinite(p.expected)
      ? Math.abs(p.actual - p.expected)
      : Number.POSITIVE_INFINITY;
  let worst = points[0];
  let sumSq = 0;
  for (const p of points) {
    const error = errorOf(p);
    sumSq += error * error;
    if (error > errorOf(worst)) {
      worst = p;
    }
  }
  const maxError = errorOf(worst);
  return {
    pass: maxError <= tolerance,
    tolerance,
    maxError,
    rmsError: Math.sqrt(sumSq / points.length),
    worst,
    points,
  };
}

/** `from`, `from + step`, … up to and including `to` (within float error). */
export function timeline(to: number, step = 1000 / 60, from = 0): number[] {
  const out: number[] = [];
  for (let i = 0; from + i * step <= to + 1e-6; i += 1) {
    out.push(+(from + i * step).toFixed(3));
  }
  return out;
}
