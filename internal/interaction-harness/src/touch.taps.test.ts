// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file touch.taps.test.ts
 * @input touch.ts's tap-interval rule (`tapIntervalFault`, a play's
 *   `boundaries.tapIntervalMs`)
 * @output Unit cases: a second touch-down received after the tap interval
 *   closed is a fault only where the page drew a frame in between. The fault
 *   keeps the frame gap across the close, and the error names the cause by
 *   it. A frameless arrival leaves the pairing to the component. Neither are
 *   taps the script spaces past the interval, nor a lift that leaves a finger
 *   down, nor a play without the page's times.
 * @position Node unit tests beside the harness's browser self-tests.
 *
 * SYNC: When modified, update touch.ts (tapIntervalFault).
 */

import {describe, expect, it} from 'vitest';
import {toTouchEvents, type TouchScript} from './scripts';
import {FRAME_STARVATION_MS} from './frame-starvation';
import {tapIntervalFault, TouchTapIntervalError} from './touch';

const at = {x: 100, y: 200};
const doubleTap: TouchScript = [
  {t: 0, fingers: [{id: 0, ...at}]},
  {t: 50, fingers: []},
  {t: 170, fingers: [{id: 0, ...at}]},
  {t: 220, fingers: []},
];
// A frame every 16 ms from 0 to 800 ms.
const everyFrame = Array.from({length: 51}, (_, i) => i * 16);

describe('tapIntervalFault', () => {
  it('names a second touch-down that arrived after the interval closed, with the frame between', () => {
    const steps = toTouchEvents(doubleTap);
    // The page sees the scripted stamps; the touch-down arrives at 525 ms.
    const page = {
      stamps: [0, 50, 170, 220],
      receivedAt: [5, 60, 525, 540],
      frames: everyFrame,
    };
    // The interval closes at 400 ms; the page draws from 416 to 512 ms.
    expect(tapIntervalFault(steps, page, 350)).toEqual({
      step: 2,
      gapMs: 475,
      scriptedGapMs: 120,
      tapIntervalMs: 350,
      frameAfterCloseMs: 16,
      framesAfterClose: 7,
      closeFrameGapMs: 16,
    });
  });

  it('leaves the pairing to the component when the main thread was held across the close', () => {
    const steps = toTouchEvents(doubleTap);
    // No frame from 384 ms until after the touch-down arrived at 525 ms.
    const page = {
      stamps: [0, 50, 170, 220],
      receivedAt: [5, 60, 525, 540],
      frames: everyFrame.filter(time => time <= 384 || time >= 528),
    };
    expect(tapIntervalFault(steps, page, 350)).toBeNull();
  });

  it('keeps the frame gap across the close when the page drew again only before the touch-down', () => {
    const steps = toTouchEvents(doubleTap);
    // The page's own task holds its main thread from 384 ms. It draws again
    // at 512 ms, before the touch-down it held arrives at 525 ms.
    const page = {
      stamps: [0, 50, 170, 220],
      receivedAt: [5, 60, 525, 540],
      frames: everyFrame.filter(time => time <= 384 || time >= 512),
    };
    expect(tapIntervalFault(steps, page, 350)).toMatchObject({
      step: 2,
      frameAfterCloseMs: 112,
      framesAfterClose: 1,
      closeFrameGapMs: 128,
    });
  });

  it('names a held main thread, not the runner, where a frame gap past the starvation bound spans the close', () => {
    const fault = {
      step: 2,
      gapMs: 475,
      scriptedGapMs: 120,
      tapIntervalMs: 350,
      frameAfterCloseMs: 112,
      framesAfterClose: 1,
      closeFrameGapMs: FRAME_STARVATION_MS + 1,
    };
    const held = new TouchTapIntervalError(fault).message;
    expect(held).toContain(
      `drew no frame for ${FRAME_STARVATION_MS + 1} ms across that window's close`,
    );
    expect(held).not.toContain('runner');
    const kept = new TouchTapIntervalError({
      ...fault,
      closeFrameGapMs: FRAME_STARVATION_MS,
    }).message;
    expect(kept).toContain('kept drawing across');
    expect(kept).toContain('as on a starved runner');
  });

  it('finds none when the touch-down arrives before the interval closes', () => {
    const steps = toTouchEvents(doubleTap);
    const page = {
      stamps: [0, 50, 170, 220],
      receivedAt: [5, 60, 380, 400],
      frames: everyFrame,
    };
    expect(tapIntervalFault(steps, page, 350)).toBeNull();
  });

  it('reads arrival stamps where the page stamps touches on arrival', () => {
    const steps = toTouchEvents(doubleTap);
    const stamps = [0, 50, 470, 520];
    expect(
      tapIntervalFault(
        steps,
        {stamps, receivedAt: stamps, frames: everyFrame},
        350,
      )?.gapMs,
    ).toBe(420);
  });

  it('leaves taps the script spaces past the interval to the script', () => {
    const apart: TouchScript = [
      {t: 0, fingers: [{id: 0, ...at}]},
      {t: 50, fingers: []},
      {t: 600, fingers: [{id: 0, ...at}]},
      {t: 650, fingers: []},
    ];
    const page = {
      stamps: [0, 50, 600, 650],
      receivedAt: [5, 60, 700, 720],
      frames: everyFrame,
    };
    expect(tapIntervalFault(toTouchEvents(apart), page, 350)).toBeNull();
  });

  it('ends a tap only where its last finger lifts', () => {
    // The first finger lifts and lands again while the second stays down:
    // one touch, so the late landing is no second tap.
    const second = {id: 1, x: 150, y: 200};
    const overlapping: TouchScript = [
      {t: 0, fingers: [{id: 0, ...at}]},
      {t: 50, fingers: [{id: 0, ...at}, second]},
      {t: 100, fingers: [second]},
      {t: 150, fingers: [second, {id: 0, ...at}]},
      {t: 200, fingers: []},
    ];
    const page = {
      stamps: [0, 50, 100, 150, 200],
      receivedAt: [5, 55, 105, 700, 720],
      frames: everyFrame,
    };
    expect(tapIntervalFault(toTouchEvents(overlapping), page, 350)).toBeNull();
  });

  it("proves nothing without the page's times", () => {
    expect(tapIntervalFault(toTouchEvents(doubleTap), null, 350)).toBeNull();
  });
});
