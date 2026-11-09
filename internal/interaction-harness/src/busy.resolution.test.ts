// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file busy.resolution.test.ts
 * @input busy.ts, and two recorded WebKit casts (busy.resolution.fixture.ts)
 * @output Unit tests of the cast's step in a busy proof with a control. A
 *   read in 2 px steps keeps that step when one reading falls between two
 *   steps. A window with too few new positions fails by name. A frozen or
 *   held glide stays a red on the component.
 * @position Harness unit tests, beside busy.unjudged.test.ts
 */

import {describe, expect, it} from 'vitest';

import {BusyFrameUnjudgedError, busyWindowProof} from './busy';
import {
  GLIDE_HOLD_CAST,
  GLIDE_SHORT_CAST,
  type ResolutionCast,
} from './busy.resolution.fixture';
import type {TrackedFrame} from './frames';

/**
 * The row's frames, read in the default marker's 2 px steps, and the
 * control's, with the row's top edge at `topAt`.
 */
function replay(
  {block, frames}: ResolutionCast,
  topAt: (index: number, y: number) => number = (_index, y) => y,
): {tracked: TrackedFrame[]; control: TrackedFrame[]} {
  return {
    tracked: frames.map(([t, y], index) => ({
      t: block.from + t,
      box:
        y == null ? null : {x: 24, y: topAt(index, y), width: 16, height: 16},
      pixels: y == null ? 0 : 256,
      step: {x: 2, y: 2},
      engine: 'webkit',
    })),
    control: frames.map(([t, , x]) => ({
      t: block.from + t,
      box: x == null ? null : {x, y: 0, width: 10, height: 11},
      pixels: x == null ? 0 : 110,
      engine: 'webkit',
    })),
  };
}

const options = {axis: 'y', settledWithin: 4} as const;

/** The index of the cast's first frame at or after `ms` past the block's start. */
function frameAt({frames}: ResolutionCast, ms: number): number {
  return frames.findIndex(([t]) => t >= ms);
}

describe("busyWindowProof on a glide near two of the cast's steps a frame", () => {
  it('passes the recorded glide where one reading between two steps would set a 1 px step', () => {
    const {tracked, control} = replay(GLIDE_HOLD_CAST);
    const proof = busyWindowProof(tracked, GLIDE_HOLD_CAST.block, {
      ...options,
      control,
    });
    expect(proof.verdict.failures).toEqual([]);
    expect(proof.stepPx).toBe(2);
  });

  it("names the recorded glide that shows a new position on too few of the control's frames", () => {
    const {tracked, control} = replay(GLIDE_SHORT_CAST);
    let thrown: unknown;
    try {
      busyWindowProof(tracked, GLIDE_SHORT_CAST.block, {...options, control});
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(BusyFrameUnjudgedError);
    const {unresolved, message} = thrown as BusyFrameUnjudgedError;
    expect(unresolved).toEqual({positions: 3, min: 4});
    expect(message).toContain('too little to judge');
  });

  it('keeps a glide frozen through the block a red on the row', () => {
    const {block} = GLIDE_HOLD_CAST;
    const from = frameAt(GLIDE_HOLD_CAST, 0);
    const to = frameAt(GLIDE_HOLD_CAST, block.to - block.from);
    const held = GLIDE_HOLD_CAST.frames[from][1] ?? 0;
    const {tracked, control} = replay(GLIDE_HOLD_CAST, (index, y) =>
      index >= from && index < to ? held : y,
    );
    const proof = busyWindowProof(tracked, block, {...options, control});
    expect(proof.verdict.failures).toContainEqual(
      expect.stringMatching(
        /^moved on \d+ of the \d+ frames the control moved/,
      ),
    );
  });

  it('keeps a glide held for three frames a red on the row', () => {
    const from = frameAt(GLIDE_HOLD_CAST, 40);
    const held = GLIDE_HOLD_CAST.frames[from - 1][1] ?? 0;
    const {tracked, control} = replay(GLIDE_HOLD_CAST, (index, y) =>
      index >= from && index < from + 3 ? held : y,
    );
    const proof = busyWindowProof(tracked, GLIDE_HOLD_CAST.block, {
      ...options,
      control,
    });
    expect(proof.verdict.failures.length).toBeGreaterThan(0);
  });
});
