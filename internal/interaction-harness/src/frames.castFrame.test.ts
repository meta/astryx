// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file frames.castFrame.test.ts
 * @input A fake screencast's frame times (no browser)
 * @output `latestFrameAt` reads the latest presentation time of frames that
 *   arrive out of order. `waitForCastFrame` returns once a frame presented
 *   after its moment arrives, not a frame that arrives after it, and fails by
 *   name when none comes.
 * @position Unit test of ./frames' cast-frame wait; the browser self-test is
 *   in harness.interaction.browser.spec.ts.
 */

import {describe, expect, it} from 'vitest';
import {
  FrameStarvationError,
  latestFrameAt,
  waitForCastFrame,
  type Screencast,
} from './frames';

/** A cast whose frames arrive one every `everyMs`, presented at `times`. */
function fakeCast(times: readonly number[], everyMs: number): Screencast {
  const start = Date.now();
  const arrived = () =>
    times
      .slice(0, Math.floor((Date.now() - start) / everyMs) + 1)
      .map(t => ({t}));
  return {
    frameCount: () => arrived().length,
    lastFrameAt: () => latestFrameAt(arrived()),
    stop: async () => [],
  };
}

describe('latestFrameAt', () => {
  it('reads the latest presentation time, not the frame that arrived last', () => {
    expect(latestFrameAt([{t: 10}, {t: 46}, {t: 35}])).toBe(46);
    expect(latestFrameAt([])).toBeNull();
  });
});

describe('waitForCastFrame', () => {
  it('returns a frame presented after its moment, not the first one that arrives after the wait begins', async () => {
    // Every frame arrives after the wait begins; only the last was presented
    // after 25.
    const cast = fakeCast([10, 20, 30], 20);
    await expect(
      waitForCastFrame(cast, {after: 25, during: 'the box rested'}),
    ).resolves.toBe(30);
  });

  it('names both times, not starvation, when frames still come but none was presented after its moment', async () => {
    // Every frame was presented 5 ms ago: the cast is not quiet.
    const fresh: Screencast = {
      frameCount: () => 1,
      lastFrameAt: () => Date.now() - 5,
      stop: async () => [],
    };
    const outcome = await waitForCastFrame(fresh, {
      after: Date.now() + 60_000,
      during: 'the box moved',
      timeoutMs: 100,
    }).catch((error: unknown) => error);
    expect(outcome).not.toBeInstanceOf(FrameStarvationError);
    expect(String(outcome)).toMatch(
      /waitForCastFrame: no frame presented after \d+\.\d while the box moved \(\d+ ms\)\. The cast's latest frame was presented \d+\.\d ms before that, \d+\.\d ms ago, so frames still come/,
    );
  });

  it('fails by name when no frame presented after its moment comes', async () => {
    const cast = fakeCast([10, 20], 5);
    const outcome = await waitForCastFrame(cast, {
      after: 100,
      during: 'the box rested',
      timeoutMs: 100,
    }).catch((error: unknown) => error);
    expect(outcome).toBeInstanceOf(FrameStarvationError);
    expect(String(outcome)).toMatch(
      /waitForCastFrame: the page drew 0 frames while the box rested \(\d+ ms\), where the proof needs 1\. No frame came for \d+\.\d ms: the screen did not change after 100\.0, or the page was starved of frames\. Keep something moving/,
    );
  });
});
