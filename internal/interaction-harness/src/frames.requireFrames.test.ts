// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file frames.requireFrames.test.ts
 * @input frames.ts's frame-count precondition for proofs
 * @output Unit cases for `requireFrames`. Enough selected frames come back.
 *   Too few, where no frame came for longer than FRAME_STARVATION_MS, fail
 *   with FrameStarvationError and its numbers. Too few on pace fail with a
 *   plain Error. With none selected, every gap counts. A page that drew one
 *   frame at most in the whole sample was starved.
 * @position Node unit tests beside the harness's browser self-tests.
 *
 * SYNC: When modified, update frames.ts (requireFrames).
 */

import {describe, expect, it} from 'vitest';
import {
  FRAME_STARVATION_MS,
  FrameStarvationError,
  requireFrames,
} from './frames';

/** Frames at these page times, ms, each with the value it showed. */
const trace = (times: readonly number[]) =>
  times.map((t, index) => ({t, value: index}));

describe('requireFrames', () => {
  it('gives back the selected frames when there are enough', () => {
    const frames = trace([0, 16.7, 33.3, 50, 66.7, 83.3, 100]);
    const selected = requireFrames(frames, {
      min: 3,
      during: 'a slide',
      where: frame => frame.t >= 50,
    });
    expect(selected.map(frame => frame.t)).toEqual([50, 66.7, 83.3, 100]);
  });

  it('names a starved page, with the longest gap around the selected frames', () => {
    // Two frames inside the motion, 180 ms after the frame before them.
    const frames = trace([0, 20, 200, 220, 400]);
    let error: unknown;
    try {
      requireFrames(frames, {
        min: 6,
        during: 'the screen slides in',
        where: frame => frame.t > 100 && frame.t < 300,
      });
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toBeInstanceOf(FrameStarvationError);
    expect((error as FrameStarvationError).numbers).toEqual({
      during: 'the screen slides in',
      frames: 2,
      min: 6,
      longestGapMs: 180,
    });
    expect(String(error)).toMatch(
      /the page drew 2 frames while the screen slides in, where the proof needs 6\. No frame came for 180\.0 ms: the page was starved of frames/,
    );
  });

  it('fails a motion too short for the proof with a plain error, not as starvation', () => {
    const frames = trace([0, 16.7, 33.3, 50, 66.7]);
    let error: unknown;
    try {
      requireFrames(frames, {
        min: 6,
        during: 'a fade',
        where: frame => frame.t >= 16.7 && frame.t <= 33.3,
      });
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(FrameStarvationError);
    expect(String(error)).toMatch(/the motion did not last that long/);
  });

  it('counts every gap when no frame is selected', () => {
    const starved = trace([0, 16.7, 16.7 + FRAME_STARVATION_MS + 1]);
    expect(() =>
      requireFrames(starved, {min: 1, during: 'a push', where: () => false}),
    ).toThrow(FrameStarvationError);
    const onPace = trace([0, 16.7, 33.3]);
    expect(() =>
      requireFrames(onPace, {min: 1, during: 'a push', where: () => false}),
    ).toThrow(/the motion did not last that long/);
  });

  it('names a page that drew one frame in the whole sample as starved', () => {
    let error: unknown;
    try {
      requireFrames(trace([0]), {min: 2, during: 'a slide'});
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toBeInstanceOf(FrameStarvationError);
    expect((error as FrameStarvationError).numbers.longestGapMs).toBe(
      Number.POSITIVE_INFINITY,
    );
    expect(String(error)).toMatch(
      /the page drew 1 frame while a slide, where the proof needs 2\. No second frame came: the page was starved of frames/,
    );
  });
});
