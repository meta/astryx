// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file spring.ts
 * @input A duration/bounce pair, the way Motion describes a spring
 * @output A sampler, a CSS linear() easing, and the equivalent physics numbers
 * @position Motion Lab utility; no React, no DOM
 *
 * Springs have no CSS representation, which is the reason the proposal keeps
 * them in the JS mirror rather than the token file. The lab still has to show
 * one moving, so this approximates Motion's duration/bounce model as a damped
 * harmonic oscillator: bounce maps to the damping ratio, duration to the
 * settle time. Close enough to judge feel and to argue about whether 0.2
 * belongs in a crisp library, which is all the lab needs it for.
 *
 * `linear()` is what makes it usable: sampling the curve into a CSS easing
 * lets a plain transition play a spring, which is also the escape hatch for a
 * component that cannot take a JS dependency.
 */

export type Spring = {
  readonly duration: number;
  readonly bounce: number;
  /** Position at time t in seconds; 1 is the target. */
  sample: (t: number) => number;
  /** A CSS `linear()` easing that replays this spring over its duration. */
  linear: (steps?: number) => string;
  /** Peak position, so overshoot can be reported as a percentage. */
  overshoot: () => number;
  /** Where it has got to when the nominal duration is up. */
  settle: () => number;
  /** Roughly equivalent stiffness/damping, for anyone thinking in those. */
  readonly stiffness: number;
  readonly damping: number;
};

export function createSpring(duration: number, bounce: number): Spring {
  const d = Math.max(0.05, duration);
  const b = Math.min(0.95, Math.max(-0.5, bounce));
  // bounce 0 is critically damped; positive bounce is underdamped.
  const zeta = Math.max(0.05, 1 - b);
  // Envelope decays to ~1% of the travel by t = d, which is what makes the
  // number the caller passes behave like a duration rather than a frequency.
  const omega = 4.6 / (zeta * d);
  const damped = zeta < 1 ? omega * Math.sqrt(1 - zeta * zeta) : 0;

  const sample = (t: number): number => {
    if (t <= 0) {
      return 0;
    }
    if (zeta < 1) {
      const envelope = Math.exp(-zeta * omega * t);
      return (
        1 -
        envelope *
          (Math.cos(damped * t) +
            ((zeta * omega) / damped) * Math.sin(damped * t))
      );
    }
    const envelope = Math.exp(-omega * t);
    return 1 - envelope * (1 + omega * t);
  };

  return {
    duration: d,
    bounce: b,
    sample,
    stiffness: Math.round(omega * omega),
    damping: Math.round(2 * zeta * omega * 10) / 10,
    linear(steps = 64) {
      const points: string[] = [];
      for (let i = 0; i <= steps; i++) {
        points.push(sample((i / steps) * d).toFixed(4));
      }
      return `linear(${points.join(',')})`;
    },
    overshoot() {
      // The peak of a light spring lands after the nominal duration, so look
      // past it or the number reads as zero overshoot on every preset.
      let peak = 0;
      for (let i = 0; i <= 400; i++) {
        peak = Math.max(peak, sample((i / 400) * d * 3));
      }
      return peak;
    },
    settle: () => sample(d),
  };
}

// --- cubic-bezier ----------------------------------------------------------

export type BezierPoints = readonly [number, number, number, number];

const NAMED_CURVES: Readonly<Record<string, BezierPoints>> = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
};

export function parseBezier(value: string): BezierPoints {
  const trimmed = value.trim();
  const named = NAMED_CURVES[trimmed];
  if (named != null) {
    return named;
  }
  const match = /cubic-bezier\(([^)]+)\)/.exec(trimmed);
  if (match != null) {
    const parts = match[1].split(',').map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite)) {
      return [parts[0], parts[1], parts[2], parts[3]];
    }
  }
  return NAMED_CURVES.ease;
}

export function formatBezier(points: BezierPoints): string {
  return `cubic-bezier(${points.map(n => Number(n.toFixed(3))).join(', ')})`;
}

export function isNamedCurve(value: string): boolean {
  return Object.hasOwn(NAMED_CURVES, value.trim());
}

const bezierAxis = (a: number, b: number, t: number): number => {
  const u = 1 - t;
  return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t;
};

/** Progress along the curve's y axis at x, which is what "eased" means. */
export function bezierAt(points: BezierPoints, x: number): number {
  if (x <= 0) {
    return 0;
  }
  if (x >= 1) {
    return 1;
  }
  let low = 0;
  let high = 1;
  let t = x;
  for (let i = 0; i < 32; i++) {
    const guess = bezierAxis(points[0], points[2], t);
    if (Math.abs(guess - x) < 1e-5) {
      break;
    }
    if (guess < x) {
      low = t;
    } else {
      high = t;
    }
    t = (low + high) / 2;
  }
  return bezierAxis(points[1], points[3], t);
}

/** An SVG path for a curve plotted into a box, used by both editors. */
export function plotPath(
  fn: (x: number) => number,
  width: number,
  height: number,
  pad: number,
  yMin: number,
  yMax: number,
  samples = 120,
): string {
  const points: string[] = [];
  for (let i = 0; i <= samples; i++) {
    const x = i / samples;
    const px = pad + x * (width - pad * 2);
    const py =
      height - pad - ((fn(x) - yMin) / (yMax - yMin)) * (height - pad * 2);
    points.push(`${px.toFixed(2)},${py.toFixed(2)}`);
  }
  return `M${points.join('L')}`;
}
