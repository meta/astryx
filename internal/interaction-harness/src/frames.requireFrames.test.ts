// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file frames.requireFrames.test.ts
 * @input frames.ts's frame-count precondition for proofs
 * @output Unit cases for `requireFrames`. Enough selected frames come back.
 *   Too few, where no frame came for longer than FRAME_STARVATION_MS, fail
 *   with FrameStarvationError and its numbers. Too few on pace fail with a
 *   plain Error. With none selected, every gap counts.
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

  it('names a page that drew every frame slowly as starved, with the mean interval, when the motion lasted long enough at 60 Hz', () => {
    // Five frames 40 ms apart: no gap over FRAME_STARVATION_MS, but 160 ms
    // holds ten frames at 60 Hz.
    const frames = trace([0, 40, 80, 120, 160, 200, 240]);
    let error: unknown;
    try {
      requireFrames(frames, {
        min: 6,
        during: 'the sheet closes',
        where: frame => frame.t >= 40 && frame.t <= 200,
      });
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toBeInstanceOf(FrameStarvationError);
    expect((error as FrameStarvationError).numbers).toEqual({
      during: 'the sheet closes',
      frames: 5,
      min: 6,
      longestGapMs: 40,
      meanFrameMs: 40,
    });
    expect(String(error)).toMatch(
      /the page drew 5 frames while the sheet closes, where the proof needs 6\. Frames came every 40\.0 ms on average, where 60 Hz draws one every 16\.7 ms, and none more than 40\.0 ms after the one before: the page was starved of frames/,
    );
  });

  it('still says a motion that ended early did not last, at 60 Hz, and names its span', () => {
    // Five frames at 60 Hz: 66.7 ms holds five, one short of the proof's six.
    const frames = trace([0, 16.7, 33.3, 50, 66.7, 83.3, 100]);
    let error: unknown;
    try {
      requireFrames(frames, {
        min: 6,
        during: 'the sheet closes',
        where: frame => frame.t >= 16.7 && frame.t <= 83.3,
      });
    } catch (thrown) {
      error = thrown;
    }
    expect(error).not.toBeInstanceOf(FrameStarvationError);
    expect(String(error)).toMatch(
      /the frames span 66\.6 ms, time for 5 frames at 60 Hz: the motion did not last that long/,
    );
  });

  it('names a selection that skips frames the page drew on pace, not starvation and not a short motion', () => {
    // Every frame at 60 Hz, but the selection skips every other one.
    const frames = trace([0, 16.7, 33.3, 50, 66.7, 83.3, 100, 116.7, 133.3]);
    let error: unknown;
    try {
      requireFrames(frames, {
        min: 6,
        during: 'the sheet closes',
        where: frame => frame.value % 2 === 1,
      });
    } catch (thrown) {
      error = thrown;
    }
    expect(error).not.toBeInstanceOf(FrameStarvationError);
    expect(String(error)).toMatch(
      /`where` selected 4 frames while the sheet closes, where the proof needs 6\. The page drew 7 frames across those 100\.0 ms, so the selection, not the page, came up short/,
    );
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
});
