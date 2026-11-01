// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {controlClock} from './controlClock';

/** The control's x at its own time `ms`: 240 px out in 400 ms, back in 400. */
function controlX(ms: number): number {
  const phase = ((ms % 800) + 800) % 800;
  return phase < 400 ? phase * 0.6 : 240 - (phase - 400) * 0.6;
}

/**
 * Frames 16 ms apart from the control's time `from`, stamped on a clock
 * `offset` ms ahead of it; `late` adds lateness to chosen frames' stamps.
 */
function frames(
  from: number,
  count: number,
  offset: number,
  late: ReadonlyMap<number, number> = new Map(),
) {
  return Array.from({length: count}, (_, i) => {
    const ms = from + i * 16;
    return {t: ms + offset + (late.get(i) ?? 0), x: controlX(ms), ms};
  });
}

/** How far each reading strays from the control's true time, past a constant. */
function strays(
  run: ReadonlyArray<{ms: number}>,
  clock: ReadonlyArray<{i: number; ms: number}>,
): number {
  const gaps = clock.map(({i, ms}) => ms - run[i].ms).sort((a, b) => a - b);
  return gaps[gaps.length - 1] - gaps[0];
}

describe('controlClock', () => {
  it('reads every frame on the control’s own time on an even run', () => {
    const run = frames(100, 60, 5_000);
    const clock = controlClock(run);
    expect(clock.length).toBeGreaterThan(40);
    expect(strays(run, clock)).toBeLessThan(1e-6);
  });

  it('reads every frame right when the first usable frame sits just inside the band on its way out and the next usable one comes after the turn', () => {
    // x 214 on the way out (356.7 ms); the frames until 452.7 ms sit above
    // the band, and the next usable one, at 208.4, is on the way back.
    const run = frames(356 + 2 / 3, 60, 5_000);
    const clock = controlClock(run);
    expect(strays(run, clock)).toBeLessThan(1e-6);
  });

  it('reads every other frame right when the first usable frame is stamped 50 ms late', () => {
    const run = frames(100, 60, 5_000, new Map([[0, 50]]));
    const clock = controlClock(run).filter(({i}) => i !== 0);
    expect(strays(run, clock)).toBeLessThan(1e-6);
  });
});
