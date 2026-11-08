// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file screenSignal.test.ts
 * @input screenSignal's helpers and the interaction harness's busyWindowProof,
 *   fed a synthetic screencast
 * @output Unit proof that a busy proof's frame count holds to 60 a second
 *   when WebKit's container screencast alternates 11.3 and 17.1 ms intervals
 * @position Tests for __tests__/screenSignal.ts
 */

import {describe, expect, it} from 'vitest';
import {
  busyWindowProof,
  type TrackedFrame,
} from '@astryxdesign/interaction-harness';
import {presentedFramesExpected} from './screenSignal';

/** A marker that grows in every frame of a cast alternating `a` and `b` ms. */
function alternatingCast(a: number, b: number, until: number): TrackedFrame[] {
  const frames: TrackedFrame[] = [];
  for (let t = 0, i = 0; t <= until; t += i % 2 === 0 ? a : b, i += 1) {
    frames.push({t, box: {x: 0, y: 0, width: 100, height: 100 + i}, pixels: 1});
  }
  return frames;
}

describe('presentedFramesExpected', () => {
  it('counts no more than 60 frames a second where the cast alternates 11.3 and 17.1 ms', () => {
    const frames = alternatingCast(11.3, 17.1, 900);
    const judge = (from: number) =>
      busyWindowProof(
        frames,
        {from, to: from + 300},
        {axis: 'height', settledWithin: 1},
      );
    // The same cast and the same 300 ms window, 15 ms apart. The median the
    // proof counts in lands on 11.3 or 17.1 ms by parity.
    const proof = judge(305);
    expect(proof.cadenceMs).toBeCloseTo(11.3, 1);
    expect(judge(320).cadenceMs).toBeCloseTo(17.1, 1);
    // On 11.3 ms it promises frames a 60 Hz display never shows, so an
    // animation that moved in every frame shown reads as dropping frames.
    expect(proof.changed).toBeGreaterThanOrEqual(proof.frames - 1);
    expect(proof.frames).toBeLessThan(proof.expectedFrames - 2);
    // Counted at no less than one 60 Hz frame, the same frames hold, at
    // either parity.
    expect(proof.frames).toBeGreaterThanOrEqual(
      presentedFramesExpected(proof) - 2,
    );
    expect(presentedFramesExpected(proof)).toBe(
      presentedFramesExpected(judge(320)),
    );
  });

  it('counts in the cast itself when it is slower than 60 Hz', () => {
    const proof = busyWindowProof(
      alternatingCast(20, 20, 900),
      {from: 300, to: 600},
      {axis: 'height', settledWithin: 1},
    );
    expect(presentedFramesExpected(proof)).toBe(
      Math.floor((proof.judged.to - proof.judged.from) / 20),
    );
  });
});
