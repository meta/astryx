// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file callerMotionValues.test.ts
 * @input vitest, easedProgress and solveAnimatedPageScroll, and copies of
 *   their earlier versions, on a fixed grid of easings, durations, moves and
 *   retarget velocities
 * @output Checks that each position and velocity is the same number, bit for
 *   bit, as the earlier version gives on the same platform
 * @position Testing; guards the values that Popover, SegmentedControl and the
 *   pager read from the progress module
 */

import {describe, expect, it} from 'vitest';
import type {MotionCurve} from '../animator';
import {cubicBezier, type BezierPoints} from '../bezier';
import {solveAnimatedPageScroll} from '../paging';
import {easedProgress} from '../progress';
import {paging} from '../uikit/paging';

// The two reference functions below are copies of main at ebb9ddec. Their
// float results can change with the platform's math library, so the test
// compares them with the shipped functions on one platform, not with a
// stored hash.

/** easedProgress, copied from themeTiming.ts. */
function referenceEasedProgress(
  seconds: number,
  ease: (x: number) => number,
  {jumps = false}: {readonly jumps?: boolean} = {},
): MotionCurve {
  const at = (t: number) =>
    seconds <= 0 || t >= seconds ? 1 : ease(Math.max(0, t) / seconds);
  // A central difference, one step inside the curve at either end.
  const step = Math.min(1e-3, seconds / 100);
  return {
    duration: seconds,
    at,
    velocity: t => {
      if (seconds <= 0 || t >= seconds) {
        return 0;
      }
      const before = Math.max(0, t - step);
      const after = Math.min(seconds, t + step);
      if (!jumps) {
        return (at(after) - at(before)) / (after - before);
      }
      const here = at(t);
      const slopes: number[] = [];
      if (t > before) {
        slopes.push((here - at(before)) / (t - before));
      }
      if (after > t) {
        slopes.push((at(after) - here) / (after - t));
      }
      return slopes.reduce((a, b) => (Math.abs(b) < Math.abs(a) ? b : a));
    },
  };
}

/** solveAnimatedPageScroll, copied from paging.ts. */
function referenceAnimatedPageScroll({
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

const EASINGS: ReadonlyArray<BezierPoints> = [
  [0, 0, 1, 1],
  [0.25, 0.1, 0.25, 1],
  [0.42, 0, 1, 1],
  [0, 0, 0.58, 1],
  [0.42, 0, 0.58, 1],
  [0.2, 0, 0, 1],
  [0.24, 1, 0.4, 1],
];

/**
 * 1,005 times, in steps of 1/1000 of `duration`, from 2 steps before it, and
 * 10 µs, 0.1 ms and 1 ms in from each end.
 */
function sampleTimes(duration: number): number[] {
  const times: number[] = [];
  for (let i = 0; i < 1005; i++) {
    times.push(((i - 2) / 1000) * duration);
  }
  for (const inset of [1e-5, 1e-4, 1e-3]) {
    times.push(inset, duration - inset);
  }
  return times;
}

/** Collects each sample whose shipped value is not the reference's. */
function differences() {
  let compared = 0;
  const found: string[] = [];
  return {
    compare(label: string, shipped: number, reference: number) {
      compared++;
      if (!Object.is(shipped, reference) && found.length < 5) {
        found.push(`${label}: ${shipped} is not ${reference}`);
      }
    },
    get compared() {
      return compared;
    },
    found,
  };
}

describe('the values Popover, SegmentedControl and the pager read', () => {
  it('easedProgress gives the same positions and velocities as before', () => {
    const quarterSteps = (x: number) => Math.floor(4 * x) / 4;
    const eases = [
      ...EASINGS.map(points => ({
        name: points.join(','),
        ease: cubicBezier(points),
      })),
      {name: 'steps(4)', ease: quarterSteps},
      {name: 'linear', ease: (x: number) => x},
    ];
    const positions = differences();
    const velocities = differences();
    for (const {name, ease} of eases) {
      for (const seconds of [0, 0.001, 0.1, 0.15, 0.2, 0.3, 0.5]) {
        for (const jumps of [false, true]) {
          const shipped = easedProgress(seconds, ease, {jumps});
          const reference = referenceEasedProgress(seconds, ease, {jumps});
          for (const t of sampleTimes(seconds)) {
            const label = `${name} ${seconds} s jumps=${jumps} t=${t}`;
            positions.compare(label, shipped.at(t), reference.at(t));
            velocities.compare(
              label,
              shipped.velocity(t),
              reference.velocity(t),
            );
          }
        }
      }
    }
    expect(positions.compared).toBe(9 * 7 * 2 * 1011);
    expect(positions.found).toEqual([]);
    expect(velocities.found).toEqual([]);
  });

  // From rest, the velocity at t <= 0 is the one value that changes:
  // paging.test.ts holds it to the curve's starting slope.
  it('the pager gives the same positions, and each velocity but the first from rest', () => {
    const positions = differences();
    const velocities = differences();
    for (const curve of [undefined, ...EASINGS]) {
      for (const durationMs of [150, 300, 350]) {
        for (const [from, to] of [
          [0, 402],
          [0, 804],
          [0, 2010],
          [804, 402],
          [100, -200],
          [100, 100],
        ]) {
          for (const velocity of [undefined, 900, -900, 0, 2500]) {
            const move = {from, to, durationMs, curve, velocity};
            const shipped = solveAnimatedPageScroll(move);
            const reference = referenceAnimatedPageScroll(move);
            for (const t of sampleTimes(reference.duration)) {
              const label = `${JSON.stringify(move)} t=${t}`;
              positions.compare(label, shipped.at(t), reference.at(t));
              if (t > 0 || velocity != null) {
                velocities.compare(
                  label,
                  shipped.velocity(t),
                  reference.velocity(t),
                );
              }
            }
          }
        }
      }
    }
    expect(positions.compared).toBe(8 * 3 * 6 * 5 * 1011);
    expect(positions.found).toEqual([]);
    expect(velocities.found).toEqual([]);
  });
});
