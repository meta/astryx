// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file busy.test.ts
 * @input Synthetic tracked frames (no browser)
 * @output The busy-main-thread verdict's limits: dropped frames a loaded
 *   machine produces pass, a frozen animation fails every criterion, and
 *   out-of-order frames are judged in presentation order.
 * @position Unit test of ./busy and ./frames' ordering; the browser proof
 *   with a real compositor animation and a rAF control is in
 *   harness.interaction.browser.spec.ts.
 */

import {describe, expect, it} from 'vitest';
import {busyWindowProof} from './busy';
import {inPresentationOrder, type TrackedFrame} from './frames';

const FRAME = 1000 / 60;
const BLOCK = {from: 1000, to: 1700};

/** A marker moving 3 px per frame from t = 800 to 1900, minus `dropped` frame indices. */
function moving(dropped: readonly number[] = []): TrackedFrame[] {
  const frames: TrackedFrame[] = [];
  for (let i = 0; 800 + i * FRAME <= 1900; i += 1) {
    if (dropped.includes(i)) {
      continue;
    }
    frames.push({
      t: 800 + i * FRAME,
      box: {x: 0, y: 3 * i, width: 10, height: 10},
    } as TrackedFrame);
  }
  return frames;
}

/** Index of the first frame at or after `t`. */
const at = (t: number) => Math.ceil((t - 800) / FRAME);

describe('busyWindowProof verdict', () => {
  it('passes a compositor animation with every frame', () => {
    const proof = busyWindowProof(moving(), BLOCK);
    expect(proof.verdict.failures).toEqual([]);
    expect(proof.longestStallFrames).toBe(1);
  });

  it('passes one and two consecutive dropped frames (3 intervals)', () => {
    const k = at(1300);
    expect(busyWindowProof(moving([k]), BLOCK).verdict.failures).toEqual([]);
    const two = busyWindowProof(moving([k, k + 1]), BLOCK);
    expect(two.longestStallFrames).toBe(3);
    expect(two.verdict.failures).toEqual([]);
  });

  it('fails three consecutive dropped frames', () => {
    const k = at(1300);
    const proof = busyWindowProof(moving([k, k + 1, k + 2]), BLOCK);
    expect(proof.longestStallFrames).toBe(4);
    expect(proof.verdict.failures.join('\n')).toMatch(/longest stall/);
  });

  it('fails when more than 10% of the expected frames are missing', () => {
    const k = at(1050);
    // 39 frames expected: up to 3 may be missing (10% = 3.9).
    const scattered = [0, 12, 24].map(d => k + d);
    expect(busyWindowProof(moving(scattered), BLOCK).verdict.failures).toEqual(
      [],
    );
    const many = [0, 6, 12, 18, 24].map(d => k + d);
    expect(
      busyWindowProof(moving(many), BLOCK).verdict.failures.join('\n'),
    ).toMatch(/expected frames moved/);
  });

  it('lets a short window miss a frame, not three', () => {
    // 150 ms judged: 8 whole intervals, one miss allowed (10% would be 0.8).
    const short = {from: 1000, to: 1190};
    const k = at(1040);
    expect(busyWindowProof(moving([k]), short).verdict.failures).toEqual([]);
    // Three of nine missing fails, on frame count or cadence.
    expect(busyWindowProof(moving([k, k + 3, k + 6]), short).verdict.pass).toBe(
      false,
    );
  });

  it('fails a frozen animation on every criterion', () => {
    // Frames before and after the block only: nothing changed during it.
    const frozen = moving().filter(f => f.t < BLOCK.from || f.t > BLOCK.to);
    const proof = busyWindowProof(frozen, BLOCK);
    expect(proof.changed).toBe(0);
    expect(proof.verdict.pass).toBe(false);
    expect(proof.verdict.failures.join('\n')).toMatch(/median frame interval/);
    expect(proof.verdict.failures.join('\n')).toMatch(/longest stall/);
    expect(proof.verdict.failures.join('\n')).toMatch(/expected frames moved/);
  });

  it('fails a half-rate animation (median interval above display rate)', () => {
    const odd = moving().filter((_, i) => i % 2 === 1);
    expect(busyWindowProof(odd, BLOCK).verdict.failures.join('\n')).toMatch(
      /median frame interval/,
    );
  });
});

describe('busyWindowProof settledWithin', () => {
  it('ends the judgment at a rounded easing tail, which would read as a stall', () => {
    // An ease-out to y = 24 as the screencast reports it: whole pixels, so the
    // tail repeats values while it still moves.
    const ys = [
      120, 100, 82, 67, 55, 46, 39, 34, 30, 28, 27, 26, 26, 26, 25, 25, 24, 24,
      24, 24,
    ];
    const frames = ys.map(
      (y, i) =>
        ({
          t: 1000 + i * FRAME,
          box: {x: 0, y, width: 10, height: 10},
        }) as TrackedFrame,
    );
    const window = {from: 1000, to: 1000 + ys.length * FRAME};
    const loose = busyWindowProof(frames, window, {
      settledWithin: 2,
      marginMs: 0,
    });
    expect(loose.verdict.failures).toEqual([]);
    const strict = busyWindowProof(frames, window, {
      settledWithin: 1,
      marginMs: 0,
    });
    expect(strict.longestStallFrames).toBeGreaterThanOrEqual(3);
  });
});

describe('inPresentationOrder', () => {
  it('sorts frames delivered out of order, so motion stays monotonic', () => {
    const frames = moving();
    const k = at(1040);
    const shuffled = [...frames];
    [shuffled[k], shuffled[k + 1]] = [shuffled[k + 1], shuffled[k]];
    expect(busyWindowProof(shuffled, BLOCK).monotonic).toBe(false);
    const proof = busyWindowProof(inPresentationOrder(shuffled), BLOCK);
    expect(proof.monotonic).toBe(true);
    expect(proof.verdict.failures).toEqual([]);
  });
});
