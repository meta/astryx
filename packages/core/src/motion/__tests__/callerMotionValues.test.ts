// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file callerMotionValues.test.ts
 * @input vitest, easedProgress and solveAnimatedPageScroll on a fixed grid of
 *   easings, durations, moves and retarget velocities
 * @output Pins each value of those curves, bit for bit, as one hash per set:
 *   easedProgress's positions and velocities, the pager's positions, and the
 *   pager's velocities
 * @position Testing; guards the values that Popover, SegmentedControl and the
 *   pager read from the progress module
 */

import {createHash} from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {cubicBezier, type BezierPoints} from '../bezier';
import {solveAnimatedPageScroll} from '../paging';
import {easedProgress} from '../progress';

/** The first 16 hex digits of the SHA-256 of `values` as float64 bytes. */
function hashOf(values: ReadonlyArray<number>): string {
  const bytes = new Uint8Array(new Float64Array(values).buffer);
  return createHash('sha256').update(bytes).digest('hex').slice(0, 16);
}

const EASINGS: ReadonlyArray<BezierPoints> = [
  [0, 0, 1, 1],
  [0.25, 0.1, 0.25, 1],
  [0.42, 0, 1, 1],
  [0, 0, 0.58, 1],
  [0.42, 0, 0.58, 1],
  [0.2, 0, 0, 1],
];

/** 1,005 times, in steps of 1/1000 of `duration`, from 2 steps before it. */
function sampleTimes(duration: number): number[] {
  const times: number[] = [];
  for (let i = 0; i < 1005; i++) {
    times.push(((i - 2) / 1000) * duration);
  }
  return times;
}

describe('the values Popover, SegmentedControl and the pager read', () => {
  it('easedProgress keeps each position and velocity', () => {
    const quarterSteps = (x: number) => Math.floor(4 * x) / 4;
    const eases = [...EASINGS.map(points => cubicBezier(points)), quarterSteps];
    const values: number[] = [];
    for (const ease of eases) {
      for (const seconds of [0, 0.1, 0.2, 0.3, 0.5]) {
        for (const jumps of [false, true]) {
          const curve = easedProgress(seconds, ease, {jumps});
          for (const t of sampleTimes(seconds)) {
            values.push(curve.at(t), curve.velocity(t));
          }
        }
      }
    }
    expect(values).toHaveLength(140_700);
    expect(hashOf(values)).toBe('617cb8ab38270e58');
  });

  // From rest, the velocity at t <= 0 is the one value that changes:
  // paging.test.ts holds it to the curve's starting slope.
  it('the pager keeps each position, and each velocity but the first from rest', () => {
    const positions: number[] = [];
    const velocities: number[] = [];
    for (const curve of EASINGS) {
      for (const durationMs of [150, 300]) {
        for (const [from, to] of [
          [0, 402],
          [0, 804],
          [0, 2010],
          [804, 402],
          [100, 100],
        ]) {
          for (const velocity of [undefined, 900, -900, 0, 2500]) {
            const move = solveAnimatedPageScroll({
              from,
              to,
              durationMs,
              curve,
              velocity,
            });
            for (const t of sampleTimes(move.duration)) {
              positions.push(move.at(t));
              if (t > 0 || velocity != null) {
                velocities.push(move.velocity(t));
              }
            }
          }
        }
      }
    }
    expect(positions).toHaveLength(301_500);
    expect(hashOf(positions)).toBe('e1e70cc3826c653d');
    expect(velocities).toHaveLength(301_320);
    expect(hashOf(velocities)).toBe('5566f63049f35967');
  });
});
