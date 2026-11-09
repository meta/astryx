// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file busy.clock.test.ts
 * @input Synthetic control frames (no browser)
 * @output The control's clock. Its readings follow the control's animation
 *   time across turns and gaps, whatever the stamps say, also for frames
 *   stamped late and put out of order. A frame near a turn, or one that
 *   repeats the position before it, gets no reading. Includes the cases of
 *   the animator spec's former clock.
 * @position Unit test of ./busy's controlClock
 */

import {describe, expect, it} from 'vitest';
import {controlClock} from './busy';
import {inPresentationOrder, type TrackedFrame} from './frames';

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

/** Each frame's animation time, by its stamp (frames as `control` made them). */
function timesByStamp(
  times: readonly number[],
  frames: readonly TrackedFrame[],
): Map<number, number> {
  return new Map(frames.map((frame, i) => [frame.t, times[i]]));
}

/**
 * Expects every reading to equal its frame's animation time, both measured
 * from the earliest frame read, and returns the readings.
 */
function expectAnimationTimes(
  clock: Map<number, number>,
  times: Map<number, number>,
): {ms: number; at: number}[] {
  const read = [...clock].map(([t, at]) => ({ms: times.get(t) ?? NaN, at}));
  read.sort((a, b) => a.ms - b.ms);
  for (const reading of read) {
    expect(reading.at - read[0].at).toBeCloseTo(reading.ms - read[0].ms, 6);
  }
  return read;
}

describe('controlClock', () => {
  it('reads the animation time across turns, whatever the stamps say', () => {
    // Three turns, at 400, 800 and 1200 ms; every other frame stamped 12 ms
    // late, as a loaded machine presents them.
    const times = frameTimes(250, 1450);
    const frames = control(times, i => (i % 2) * 12);
    const clock = controlClock(frames);
    expectAnimationTimes(clock, timesByStamp(times, frames));
    // Every frame at least 36 px from both ends is read, and no other.
    for (const frame of frames) {
      const x = frame.box?.x ?? -1;
      expect(clock.has(frame.t)).toBe(x >= 36 && x <= 204);
    }
  });

  it('gives no reading to a frame near a turn', () => {
    // The turn is at 400 ms. At 360 and 410 ms the box is 24 and 6 px from
    // the end, where the two times that its position gives are close.
    const frames = control([300, 360, 410, 470]);
    const clock = controlClock(frames);
    expect(clock.has(frames[1].t)).toBe(false);
    expect(clock.has(frames[2].t)).toBe(false);
    expect(clock.get(frames[3].t)! - clock.get(frames[0].t)!).toBeCloseTo(
      170,
      6,
    );
  });

  it('reads across a gap of a whole leg or more', () => {
    const times = [100, 120, 540, 560, 1300];
    const frames = control(times);
    const read = expectAnimationTimes(
      controlClock(frames),
      timesByStamp(times, frames),
    );
    expect(read).toHaveLength(times.length);
  });

  it('reads late frames that inPresentationOrder put out of order at their own time', () => {
    // Frames one frame apart across the turn at 400 ms. Their stamps run 20
    // to 50 ms late in turn, so a frame can land after later frames.
    const times = frameTimes(50, 750);
    const late = [0, 45, 22, 0, 30, 50, 0, 20];
    const made = control(times, i => late[i % late.length]);
    const byStamp = timesByStamp(times, made);
    const frames = inPresentationOrder(made);
    // The stamps did reorder the frames.
    expect(
      frames.some(
        (frame, i) =>
          i > 0 && byStamp.get(frame.t)! < byStamp.get(frames[i - 1].t)!,
      ),
    ).toBe(true);
    const read = expectAnimationTimes(controlClock(frames), byStamp);
    expect(read.length).toBeGreaterThan(frames.length / 2);
  });

  it('reads the first usable frame and the next one right when a turn lies between them', () => {
    // At 338.3 ms the box is at 203 px on its way out, just inside the band.
    // The frames after it sit within 36 px of the end until 466.3 ms. There
    // the next usable frame is at 200.2 px, on its way back.
    const times = Array.from({length: 60}, (_, i) => 338 + 1 / 3 + i * 16);
    const frames = control(times);
    const clock = controlClock(frames);
    expect(clock.has(frames[0].t)).toBe(true);
    expect(frames.slice(1, 8).some(frame => clock.has(frame.t))).toBe(false);
    expect(clock.has(frames[8].t)).toBe(true);
    expectAnimationTimes(clock, timesByStamp(times, frames));
  });

  it('reads every frame at its own time when the first frame is stamped 50 ms late', () => {
    // The late first frame does not set the origin, so it moves no reading.
    const times = Array.from({length: 60}, (_, i) => 100 + i * 16);
    const frames = control(times, i => (i === 0 ? 50 : 0));
    const clock = controlClock(frames);
    expect(clock.has(frames[0].t)).toBe(true);
    expectAnimationTimes(clock, timesByStamp(times, frames));
  });

  it('gives no reading to a frame that repeats the position before it', () => {
    // The second frame shows the first frame's position, stamped a frame later.
    const frames = control([100, 100, 150], i => (i === 1 ? FRAME : 0));
    const clock = controlClock(frames);
    expect(clock.has(frames[1].t)).toBe(false);
    expect(clock.get(frames[2].t)! - clock.get(frames[0].t)!).toBeCloseTo(
      50,
      6,
    );
  });
});
