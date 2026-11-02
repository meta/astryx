// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file touch.pacing.test.ts
 * @input touch.ts's pacing rule, stall finder and pacing error
 * @output Unit cases: under `'schedule'` an event leaves at its scripted time
 *   from the start; under `'spacing'` its scripted interval after the event
 *   before it left, or after that dispatch returned when it outlasted the
 *   interval; a play whose dispatches each take 5 ms keeps the script's pace
 *   under `'spacing'`; a play whose third dispatch stalls sends the events
 *   behind it back to back under `'schedule'` (a burst the page reads as a
 *   much faster finger) and at the script's spacing under `'spacing'`;
 *   a gap between arrivals that reaches the stillness interval where the
 *   script's own gap is under it is a stall, a scripted hold is not; and the
 *   error names its gaps and bound.
 * @position Node unit tests beside the harness's browser self-tests.
 *
 * SYNC: When modified, update touch.ts (pacedDeadline, touchPacingStalls,
 *   TouchPacingError, TOUCH_STILLNESS_MS).
 */

import {describe, expect, it} from 'vitest';
import {
  pacedDeadline,
  TOUCH_STILLNESS_MS,
  TouchPacingError,
  touchPacingStalls,
  type TouchPacing,
} from './touch';

/** Six moves of a flick, 16 ms apart, then the lift 16 ms later. */
const STEPS = [0, 16, 32, 48, 64, 80, 96].map(t => ({t}));

/**
 * The harness's loop on a simulated clock: each event leaves once its
 * deadline has come (or at once when it is late) and its dispatch returns
 * `latencyMs[i]` later, when the page has it.
 */
function simulate(
  pacing: TouchPacing,
  latencyMs: readonly number[],
): {t: number; returnedAt: number}[] {
  const origin = 1000;
  let now = origin;
  let previous: {sentAt: number; returnedAt: number} | null = null;
  return STEPS.map((step, index) => {
    now = Math.max(now, pacedDeadline(pacing, origin, STEPS, index, previous));
    const sentAt = now;
    now += latencyMs[index];
    previous = {sentAt, returnedAt: now};
    return {t: step.t, returnedAt: now};
  });
}

/** One dispatch in the middle stalls for 100 ms; the others take 1 ms. */
const STALL_AT_THIRD = [1, 1, 100, 1, 1, 1, 1];

describe('pacedDeadline', () => {
  it("sends each event at its scripted time from the start under 'schedule'", () => {
    expect(pacedDeadline('schedule', 1000, STEPS, 0, null)).toBe(1000);
    // The event before it, however late it was answered, does not move it.
    expect(
      pacedDeadline('schedule', 1000, STEPS, 3, {
        sentAt: 1190,
        returnedAt: 1300,
      }),
    ).toBe(1048);
  });

  it("sends the first event at the start and the rest after the one before, under 'spacing'", () => {
    expect(pacedDeadline('spacing', 1000, STEPS, 0, null)).toBe(1000);
    // Answered within its 16 ms interval: 16 ms after it left.
    expect(
      pacedDeadline('spacing', 1000, STEPS, 3, {
        sentAt: 1200,
        returnedAt: 1205,
      }),
    ).toBe(1216);
    // Outlasted it: 16 ms after its answer.
    expect(
      pacedDeadline('spacing', 1000, STEPS, 3, {
        sentAt: 1200,
        returnedAt: 1300,
      }),
    ).toBe(1316);
  });
});

describe('a play whose dispatches each take 5 ms', () => {
  it("keeps the script's pace under 'spacing'", () => {
    const {gapsMs, stalls} = touchPacingStalls(
      simulate('spacing', [5, 5, 5, 5, 5, 5, 5]),
      TOUCH_STILLNESS_MS,
    );
    expect(gapsMs).toEqual([16, 16, 16, 16, 16, 16]);
    expect(stalls).toEqual([]);
  });
});

describe('a play whose third dispatch stalls', () => {
  it("bursts the events behind the stall under 'schedule'", () => {
    const {gapsMs} = touchPacingStalls(
      simulate('schedule', STALL_AT_THIRD),
      TOUCH_STILLNESS_MS,
    );
    // The stalled event reaches the page 100 ms late; the four behind it, the
    // lift too, were due during the stall and go out back to back, 1 ms
    // apart: a move's 16 px over 1 ms reads as 16,000 px/s.
    expect(gapsMs).toEqual([16, 115, 1, 1, 1, 1]);
  });

  it("keeps the script's spacing behind the stall under 'spacing', and reports the stall", () => {
    const played = simulate('spacing', STALL_AT_THIRD);
    const {gapsMs, stalls} = touchPacingStalls(played, TOUCH_STILLNESS_MS);
    expect(gapsMs).toEqual([16, 115, 17, 16, 16, 16]);
    // The stall itself still reached the page: past the stillness interval,
    // it is a pacing error, not a reading of the component.
    expect(stalls).toEqual([115]);
  });

  it("keeps a short stall's gap under the stillness interval, so the play stands", () => {
    const {gapsMs, stalls} = touchPacingStalls(
      simulate('spacing', [1, 1, 20, 1, 1, 1, 1]),
      TOUCH_STILLNESS_MS,
    );
    expect(gapsMs).toEqual([16, 35, 17, 16, 16, 16]);
    expect(stalls).toEqual([]);
  });
});

describe('touchPacingStalls', () => {
  it('reads gaps from when each dispatch returned, and a gap that reaches the bound is a stall', () => {
    const played = [
      {t: 0, returnedAt: 100},
      {t: 16, returnedAt: 140},
      {t: 32, returnedAt: 156},
    ];
    expect(touchPacingStalls(played, 40)).toEqual({
      gapsMs: [40, 16],
      stalls: [40],
    });
  });

  it('does not count a hold the script itself makes', () => {
    const played = [
      {t: 0, returnedAt: 100},
      {t: 300, returnedAt: 401},
      {t: 316, returnedAt: 417},
    ];
    expect(touchPacingStalls(played, 40).stalls).toEqual([]);
  });
});

describe('TouchPacingError', () => {
  it('names the longest gap, the bound and every gap', () => {
    const error = new TouchPacingError(40, [17, 116, 17]);
    expect(error.name).toBe('TouchPacingError');
    expect(error.message).toMatch(
      /reached the page 116 ms apart, at or over its 40 ms stillness interval/,
    );
    expect(error.message).toMatch(/gaps 17, 116, 17 ms/);
    expect(error.gapsMs).toEqual([17, 116, 17]);
  });
});
