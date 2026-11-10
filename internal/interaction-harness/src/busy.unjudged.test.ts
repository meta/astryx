// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file busy.unjudged.test.ts
 * @input busy.ts, and a recorded Chromium cast (busy.unjudged.fixture.ts)
 * @output Unit tests of `judgeEveryFrame`: a frame the cast could not judge
 *   fails by name, and a frozen or main-thread component stays a red
 * @position Harness unit tests, beside busy.control.test.ts
 */

import {describe, expect, it} from 'vitest';

import {
  BusyFrameUnjudgedError,
  BusyWindowTooLateError,
  busyWindowProof,
} from './busy';
import {ZOOM_START_CAST} from './busy.unjudged.fixture';
import type {TrackedFrame} from './frames';

const {block, frames} = ZOOM_START_CAST;

/** The photo's frames, with its top edge at each frame's `y`. */
function photo(
  topAt: (t: number, y: number) => number = (_t, y) => y,
): TrackedFrame[] {
  return frames.map(([t, y, h]) => ({
    t: block.from + t,
    box:
      y == null || h == null
        ? null
        : {x: 0, y: topAt(t, y), width: 100, height: h},
    pixels: 1,
    step: {x: 1, y: 1},
  }));
}

const control: TrackedFrame[] = frames.map(([t, , , x]) => ({
  t: block.from + t,
  box: x == null ? null : {x, y: 0, width: 12, height: 12},
  pixels: x == null ? 0 : 144,
}));

const options = {axis: 'y', settledWithin: 24, control} as const;

describe('busyWindowProof with judgeEveryFrame', () => {
  it('passes the recorded cast with one frame excused as under a step, without it', () => {
    const proof = busyWindowProof(photo(), block, options);
    expect(proof.verdict.failures).toEqual([]);
    expect(proof.control?.belowStep).toBe(1);
  });

  it('names that frame as too little to judge, with it', () => {
    let thrown: unknown;
    try {
      busyWindowProof(photo(), block, {...options, judgeEveryFrame: true});
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(BusyFrameUnjudgedError);
    const {frames: unjudged, message} = thrown as BusyFrameUnjudgedError;
    expect(unjudged).toHaveLength(1);
    expect(unjudged[0].atMs).toBeCloseTo(38.9, 0);
    expect(unjudged[0].movePx).toBeLessThan(1);
    expect(unjudged[0].stepPx).toBe(1);
    expect(message).toContain('too little to judge');
  });

  it('passes the cast when that frame shows its step', () => {
    const proof = busyWindowProof(
      photo((t, y) => (Math.abs(t - 38.9) < 0.05 ? y - 1 : y)),
      block,
      {...options, judgeEveryFrame: true},
    );
    expect(proof.verdict.failures).toEqual([]);
    expect(proof.control?.belowStep).toBe(0);
  });

  it('keeps a frozen photo a red on the photo', () => {
    // The top edge holds from +100 ms to +600 ms, then jumps to the curve.
    const frozenFrom = frames.find(([t]) => t >= 100);
    const held = frozenFrom?.[1] ?? 0;
    const proof = busyWindowProof(
      photo((t, y) => (t >= 100 && t < 600 ? held : y)),
      block,
      {...options, judgeEveryFrame: true},
    );
    expect(proof.verdict.failures.length).toBeGreaterThan(0);
  });

  it('keeps a main-thread zoom a red on the photo', () => {
    // A main-thread zoom does not move until the block ends.
    const rest = frames[0][1] ?? 0;
    let failures: readonly string[];
    try {
      failures = busyWindowProof(
        photo((t, y) => (t < block.to - block.from ? rest : y)),
        block,
        {...options, judgeEveryFrame: true},
      ).verdict.failures;
    } catch (error) {
      // A component that never moved in the window has settled before it.
      expect(error).not.toBeInstanceOf(BusyFrameUnjudgedError);
      expect(error).toBeInstanceOf(BusyWindowTooLateError);
      failures = [(error as Error).message];
    }
    expect(failures.length).toBeGreaterThan(0);
  });
});
