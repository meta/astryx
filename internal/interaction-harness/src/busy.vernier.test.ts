// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file busy.vernier.test.ts
 * @input busy.ts, busy.vernier.fixture.ts
 * @output Unit tests of the vernier control's dating. It picks a time on the
 *   right leg, and falls back near a turn, where the vernier ahead dates the
 *   frame. On a recorded WebKit run, it clears an early anchor, and a real
 *   one-step hold still fails.
 * @position Harness unit tests, beside busy.predicted.test.ts
 */

import {describe, expect, it} from 'vitest';

import {
  busyWindowProof,
  pageTimesOnControls,
  vernierTime,
  type BlockedWindow,
} from './busy';
import {frames, replay, run} from './busy.vernier.fixture';
import type {TrackedFrame} from './frames';

const START = 1_000_000;
/**
 * A kept frame where the recorded settle moves 2 to 4 px a frame. A hold of it
 * and the next frame spans one kept interval.
 */
const HOLD = {from: 108.469, frames: 2};
/** The vernier's position at `phase` ms into its 200 ms cycle. */
const at = (phase: number) =>
  phase < 100 ? phase * 2.4 : 240 - (phase - 100) * 2.4;

describe('vernierTime', () => {
  it('gives the exact time on the leg the slow controls pick, 3.9 ms off either way', () => {
    const out = START + 2 * 200 + 40;
    const back = START + 2 * 200 + 150;
    expect(vernierTime(at(40), out + 3.9, START)).toBeCloseTo(out, 9);
    expect(vernierTime(at(40), out - 3.9, START)).toBeCloseTo(out, 9);
    expect(vernierTime(at(150), back + 3.9, START)).toBeCloseTo(back, 9);
  });

  it('resolves the leg 10 ms from a turn, with the slow controls leaning toward the other leg', () => {
    // 216 px is 90 ms out and 110 ms back: 20 ms apart.
    const out = START + 200 + 90;
    const back = START + 200 + 110;
    expect(vernierTime(216, out + 3.9, START)).toBeCloseTo(out, 9);
    expect(vernierTime(216, back - 3.9, START)).toBeCloseTo(back, 9);
  });

  it('falls back within a few px of a turn, where either leg fits the slow controls', () => {
    // 232 px is 96.7 ms out and 103.3 ms back; 4 px is 1.7 ms either side
    // of the cycle's start.
    for (const coarse of [START + 96.7, START + 100, START + 103.3]) {
      expect(vernierTime(232, coarse, START)).toBeNull();
    }
    expect(vernierTime(4, START + 200, START)).toBeNull();
  });

  it('falls back when the slow controls lie more than 4 ms from every time it gives', () => {
    expect(vernierTime(at(40), START + 40 + 6, START)).toBeNull();
    expect(vernierTime(-3, START, START)).toBeNull();
  });
});

/** A control's box at `x`, CSS px, in a frame stamped `t`. */
function box(t: number, x: number, y: number): TrackedFrame {
  return {
    t,
    box: {x, y, width: 12, height: 12},
    pixels: 144,
    engine: 'webkit',
  };
}

/** Where a control that started at `start` is at `t`, for a leg of `legMs`. */
function triangle(t: number, start: number, legMs: number): number {
  const phase = (((t - start) % (2 * legMs)) + 2 * legMs) % (2 * legMs);
  const speed = 240 / legMs;
  return phase < legMs ? phase * speed : 240 - (phase - legMs) * speed;
}

describe('pageTimesOnControls with the vernier ahead', () => {
  it("dates a frame at the vernier's turn from the vernier ahead, and leaves the slow controls' time without it", () => {
    // The frame at index 3 is 101 ms into the vernier's 200 ms cycle, at its
    // turn. The slow controls read it in a 2 px block, 2.33 ms late.
    const times = Array.from(
      {length: 9},
      (_, k) => START + 1301 + (k - 3) * (80 / 3),
    );
    const stamp = (t: number) => t + 30;
    const slow = (start: number, y: number) =>
      times.map(t =>
        box(stamp(t), 2 * Math.floor(triangle(t, start, 400) / 2), y),
      );
    const control = slow(START, 0);
    const ahead = slow(START - 200, 16);
    const vernier = times.map(t => box(stamp(t), triangle(t, START, 100), 700));
    const vernierAhead = times.map(t =>
      box(stamp(t), triangle(t, START - 50, 100), 684),
    );
    const controlStarts = [START, START - 200] as const;
    const turn = times[3];
    const alone = pageTimesOnControls(control, {ahead, controlStarts, vernier});
    expect(alone.get(stamp(turn))).toBeCloseTo(turn + 7 / 3, 6);
    const both = pageTimesOnControls(control, {
      ahead,
      controlStarts,
      vernier,
      vernierAhead,
    });
    expect(both.get(stamp(turn))).toBeCloseTo(turn, 9);
    // Away from its turns, the vernier itself dates the frame.
    expect(alone.get(stamp(times[5]))).toBeCloseTo(times[5], 9);
    expect(both.get(stamp(times[5]))).toBeCloseTo(times[5], 9);
  });

  it('counts the judged frames each vernier dated, and none by the slow controls alone', () => {
    // A marker moving 3 px a frame through a block, cast at 37.5 fps, every
    // reading in 2 px blocks and stamped 30 ms late.
    const from = START + 2000;
    const times = Array.from({length: 60}, (_, k) => from - 300 + k * (80 / 3));
    const stamp = (t: number) => t + 30;
    const read = (start: number, legMs: number, y: number) =>
      times.map(t =>
        box(stamp(t), 2 * Math.floor(triangle(t, start, legMs) / 2), y),
      );
    const at = (t: number) => 200 - 0.1125 * (t - from);
    const tracked = times.map((t): TrackedFrame => ({
      t: stamp(t),
      box: {x: 2 * Math.round(at(t) / 2), y: 40, width: 12, height: 12},
      pixels: 144,
      step: {x: 2, y: 2},
      engine: 'webkit',
    }));
    const options = {
      axis: 'x' as const,
      control: read(START, 400, 0),
      ahead: read(START - 200, 400, 16),
      controlStarts: [START, START - 200] as const,
      predicted: at,
    };
    const window = {from, to: from + 1000};
    const vernier = read(START, 100, 700);
    const vernierAhead = read(START - 50, 100, 684);
    const both = busyWindowProof(tracked, window, {
      ...options,
      vernier,
      vernierAhead,
    });
    expect(both.verdict.failures, both.summary).toEqual([]);
    const counts = both.vernier;
    expect(counts?.fallback).toBe(0);
    expect(counts?.datedAhead).toBeGreaterThan(0);
    expect(counts?.dated).toBeGreaterThan(counts?.datedAhead ?? 0);
    // Without the one ahead, the frames at the vernier's turns keep the slow
    // controls' time.
    const alone = busyWindowProof(tracked, window, {...options, vernier});
    expect(alone.vernier?.datedAhead).toBe(0);
    expect(alone.vernier?.fallback).toBe(counts?.datedAhead);
  });
});

/**
 * The recorded run's frames on a clock that starts at `START`. With `hold`,
 * the marker shows the position before `from` on `frames` frames from there.
 */
function recorded(hold?: {from: number; frames: number}) {
  const series = (
    column: number,
    y: number,
    step?: {x: number; y: number},
  ): TrackedFrame[] =>
    frames.map(row => {
      const x = row[column];
      const width = row[column + 1];
      return {
        t: START + (row[0] as number),
        box: x == null || width == null ? null : {x, y, width, height: 12},
        pixels: 100,
        ...(step == null ? {} : {step}),
        engine: 'webkit',
      };
    });
  const first = frames.findIndex(row => row[0] === hold?.from);
  const tracked = series(1, 40, {x: 2, y: 2}).map((frame, i, all) =>
    hold != null && first > 0 && i >= first && i < first + hold.frames
      ? {...frame, box: all[first - 1].box}
      : frame,
  );
  const geometry: Array<[number, number, number, number, number]> = [];
  for (let i = 0; i < replay.length; i += 2) {
    geometry.push([
      START + replay[i],
      replay[i + 1],
      run.replayBox.y,
      run.replayBox.width,
      run.replayBox.height,
    ]);
  }
  const window: BlockedWindow = {
    from: START + run.block.from,
    to: START + run.block.to,
    spanMs: run.block.to - run.block.from,
    animation: {
      from: START + run.settle.from,
      to: START + run.settle.to,
      holds: false,
      geometry,
      rides: true,
    },
    controlStarts: [START + run.controlStarts[0], START + run.controlStarts[1]],
  };
  return {
    tracked,
    window,
    options: {
      axis: 'x' as const,
      settledWithinSteps: 2,
      control: series(3, 0),
      ahead: series(5, 16),
    },
    vernier: series(7, 700),
  };
}

describe('busyWindowProof with a vernier, on a recorded WebKit held release', () => {
  it('fails without the vernier: an anchor dated early leaves a frame a full step behind', () => {
    const {tracked, window, options} = recorded();
    const proof = busyWindowProof(tracked, window, options);
    expect(proof.verdict.failures.join(' ')).toMatch(
      /moved on 11 of the 12 frames the control moved/,
    );
    expect(proof.vernier).toBeUndefined();
  });

  it('passes with the vernier, which dates every frame it reads and names the rest', () => {
    const {tracked, window, options, vernier} = recorded();
    const proof = busyWindowProof(tracked, window, {...options, vernier});
    expect(proof.verdict.failures, proof.summary).toEqual([]);
    expect(proof.vernier).toEqual({
      dated: 14,
      datedAhead: 0,
      fallback: 1,
      misses: [],
    });
    expect(proof.notes.join(' ')).toMatch(
      /vernier: of the 15 frames in the judged part, 14 by the vernier, 0 by the one ahead, 1 by controls/,
    );
  });

  it('still fails a real hold across which the curve moves a full step, and says how the miss was dated', () => {
    const {tracked, window, options, vernier} = recorded(HOLD);
    const proof = busyWindowProof(tracked, window, {...options, vernier});
    expect(proof.verdict.failures.join(' ')).toMatch(
      /moved on \d+ of the \d+ frames the control moved/,
    );
    expect(proof.vernier?.misses).toEqual([
      {atMs: expect.any(Number), frame: 'vernier', anchor: 'vernier'},
    ]);
  });
});
