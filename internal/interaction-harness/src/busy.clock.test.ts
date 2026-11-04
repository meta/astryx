// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file busy.clock.test.ts
 * @input Synthetic control frames (no browser)
 * @output The control's clock. Its readings follow the control's animation
 *   time across turns, whatever the stamps say. A frame beside a turn gets no
 *   reading. A gap of a whole leg throws.
 * @position Unit test of ./busy's controlClock
 */

import {describe, expect, it} from 'vitest';
import {controlClock} from './busy';
import type {TrackedFrame} from './frames';

const FRAME = 1000 / 60;

/** The control's x at animation time `ms`: 240 px one way every 400 ms. */
function xAt(ms: number): number {
  const leg = Math.floor(ms / 400);
  const along = ((ms % 400) / 400) * 240;
  return leg % 2 === 0 ? along : 240 - along;
}

/** One frame per animation time in `times`, stamped `late(i)` ms after it. */
function control(
  times: readonly number[],
  late: (i: number) => number = () => 0,
): TrackedFrame[] {
  return times.map((ms, i) => ({
    t: 5000 + ms + late(i),
    box: {x: xAt(ms), y: 0, width: 12, height: 12},
    pixels: 144,
  }));
}

/** Animation times one frame apart, from `from` to `to`. */
function frameTimes(from: number, to: number): number[] {
  const out: number[] = [];
  for (let ms = from; ms <= to; ms += FRAME) {
    out.push(ms);
  }
  return out;
}

describe('controlClock', () => {
  it('reads the animation time across turns, whatever the stamps say', () => {
    // Three turns, at 400, 800 and 1200 ms; every other frame stamped 12 ms
    // late, as a loaded machine presents them.
    const times = frameTimes(250, 1450);
    const frames = control(times, i => (i % 2) * 12);
    const clock = controlClock(frames);
    const read = frames.flatMap((frame, i) => {
      const at = clock.get(frame.t);
      return at == null ? [] : [{ms: times[i], at}];
    });
    // Only the frames beside the three turns go unread.
    expect(read.length).toBeGreaterThanOrEqual(times.length - 6);
    for (const reading of read) {
      expect(reading.at - read[0].at).toBeCloseTo(reading.ms - read[0].ms, 6);
    }
  });

  it('gives no reading to a frame beside a turn', () => {
    // The turn is at 400 ms. At 410 ms the box is 6 px back from the end. It
    // is ahead of the frame before and behind the frame after, so either leg
    // could hold it.
    const frames = control([340, 360, 380, 410, 430]);
    const clock = controlClock(frames);
    expect(clock.has(frames[3].t)).toBe(false);
    expect(clock.get(frames[4].t)! - clock.get(frames[2].t)!).toBeCloseTo(
      50,
      6,
    );
  });

  it('throws when two readings are a whole leg apart', () => {
    expect(() => controlClock(control([100, 120, 540, 560]))).toThrow(
      /whole leg/,
    );
  });
});
