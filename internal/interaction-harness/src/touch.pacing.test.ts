// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file touch.pacing.test.ts
 * @input touch.ts's pacing rule, its reading of a paced play's release and
 *   its pacing errors
 * @output Unit cases: under `'schedule'` an event leaves at its scripted time
 *   from the start; under `'spacing'` its scripted interval after the event
 *   before it left, or after that dispatch returned when it outlasted the
 *   interval. The page's release (the last two move intervals, blended as
 *   core blends them) decides a paced play: an early stall leaves it
 *   intact; a short stall or a bunched pair at the end changes it, a fault
 *   only under a tolerance; a lift more than the stillness interval after
 *   the last move reads as rest, always a fault; a scripted rest is the
 *   script's own. A gap the page's own listeners held is the page's; a late
 *   send is the runner's.
 * @position Node unit tests beside the harness's browser self-tests.
 *
 * SYNC: When modified, update touch.ts (pacedDeadline, touchPacingFault,
 *   TouchPacingError, TouchPageStallError, TOUCH_STILLNESS_MS,
 *   TOUCH_RELEASE_NEWEST_WEIGHT).
 */

import {describe, expect, it} from 'vitest';
import type {TouchEventStep} from './scripts';
import {
  pacedDeadline,
  touchArrivalsFrom,
  TOUCH_STILLNESS_MS,
  touchPacingFault,
  TouchPacingError,
  TouchPageStallError,
  type TouchArrival,
  type TouchPacing,
} from './touch';

/**
 * A flick: the touch-down at 100 px, five moves of 16 px 16 ms apart, then
 * the lift 16 ms later. Its release is 1,000 px/s.
 */
const FLICK: TouchEventStep[] = [0, 16, 32, 48, 64, 80, 96].map((t, i) => {
  const finger = {id: 0, x: 100 + 16 * Math.min(i, 5), y: 50};
  return i === 0
    ? {t, type: 'touchStart', fingers: [finger], changed: [finger]}
    : i === 6
      ? {t, type: 'touchEnd', fingers: [], changed: [finger]}
      : {t, type: 'touchMove', fingers: [finger], changed: [finger]};
});

/**
 * The harness's loop on a simulated clock: each event leaves once its
 * deadline has come (or at once when it is late), and its dispatch returns
 * `latencyMs[i]` later, when the page has it and has handled it.
 */
function simulate(
  pacing: TouchPacing,
  latencyMs: readonly number[],
): TouchArrival[] {
  const origin = 1000;
  let now = origin;
  let previous: {sentAt: number; returnedAt: number} | null = null;
  return FLICK.map((_, index) => {
    now = Math.max(now, pacedDeadline(pacing, origin, FLICK, index, previous));
    const sentAt = now;
    now += latencyMs[index];
    previous = {sentAt, returnedAt: now};
    return {stamp: now, handledAt: now};
  });
}

/** The release share a proof that depends on the exact release might allow. */
const TOLERANCE = 0.2;

/** Arrivals at the given stamps, each handled at once. */
const at = (stamps: readonly number[]): TouchArrival[] =>
  stamps.map(stamp => ({stamp, handledAt: stamp}));

describe('pacedDeadline', () => {
  it("sends each event at its scripted time from the start under 'schedule'", () => {
    expect(pacedDeadline('schedule', 1000, FLICK, 0, null)).toBe(1000);
    // The event before it, however late it was answered, does not move it.
    expect(
      pacedDeadline('schedule', 1000, FLICK, 3, {
        sentAt: 1190,
        returnedAt: 1300,
      }),
    ).toBe(1048);
  });

  it("sends the first event at the start and the rest after the one before, under 'spacing'", () => {
    expect(pacedDeadline('spacing', 1000, FLICK, 0, null)).toBe(1000);
    // Answered within its 16 ms interval: 16 ms after it left.
    expect(
      pacedDeadline('spacing', 1000, FLICK, 3, {
        sentAt: 1200,
        returnedAt: 1205,
      }),
    ).toBe(1216);
    // Outlasted it: 16 ms after its answer.
    expect(
      pacedDeadline('spacing', 1000, FLICK, 3, {
        sentAt: 1200,
        returnedAt: 1300,
      }),
    ).toBe(1316);
  });
});

describe("touchPacingFault on a paced play's arrivals", () => {
  it("reads the script's release when every dispatch takes 5 ms", () => {
    expect(
      touchPacingFault(FLICK, simulate('spacing', [5, 5, 5, 5, 5, 5, 5])),
    ).toBeNull();
  });

  it("reads a far faster release when 'schedule' bursts the events behind a stall", () => {
    // The third dispatch stalls 100 ms; the four events behind it were due
    // during the stall and reach the page 1 ms apart.
    const fault = touchPacingFault(
      FLICK,
      simulate('schedule', [1, 1, 100, 1, 1, 1, 1]),
      TOLERANCE,
    );
    expect(fault?.kind).toBe('release');
    expect(fault?.pageReleasePxPerS).toBeGreaterThan(10_000);
    expect(fault?.scriptReleasePxPerS).toBeCloseTo(1000, 6);
  });

  it("keeps the release intact behind an early stall under 'spacing'", () => {
    // The stall stretches the second move's gap; the last two move intervals
    // keep their 16 ms.
    expect(
      touchPacingFault(
        FLICK,
        simulate('spacing', [1, 1, 100, 1, 1, 1, 1]),
        TOLERANCE,
      ),
    ).toBeNull();
  });

  it('reads 554 px/s for a 20 ms stall on the move before the last', () => {
    // Its gap stretches to 35 ms and the next leaves 16 ms after its answer:
    // 0.2 × 16 px/17 ms + 0.8 × 16 px/35 ms.
    const fault = touchPacingFault(
      FLICK,
      simulate('spacing', [1, 1, 1, 1, 20, 1, 1]),
      TOLERANCE,
    );
    expect(fault?.kind).toBe('release');
    expect(fault?.pageReleasePxPerS).toBeCloseTo(554, 0);
    expect(fault?.gapsMs).toEqual([35, 17, 16]);
    expect(fault?.scriptedGapsMs).toEqual([16, 16, 16]);
    expect(fault?.heldByPage).toBeNull();
  });

  it('reads a bunched pair of last moves as a faster release', () => {
    // The fifth event arrives 28 ms late and the last move 2 ms after it:
    // 0.2 × 16 px/2 ms + 0.8 × 16 px/44 ms.
    const fault = touchPacingFault(
      FLICK,
      at([0, 16, 32, 48, 92, 94, 110]),
      TOLERANCE,
    );
    expect(fault?.kind).toBe('release');
    expect(fault?.pageReleasePxPerS).toBeCloseTo(1891, 0);
  });

  it('leaves a stray release to a proof that gives no tolerance, and still fails a rest', () => {
    expect(
      touchPacingFault(FLICK, simulate('spacing', [1, 1, 1, 1, 20, 1, 1])),
    ).toBeNull();
    expect(
      touchPacingFault(
        FLICK,
        at([0, 16, 32, 48, 64, 80, 80 + TOUCH_STILLNESS_MS + 1]),
      )?.kind,
    ).toBe('rest');
  });

  it('reads a lift more than the stillness interval after the last move as rest, and one exactly that late as moving', () => {
    const late = touchPacingFault(
      FLICK,
      at([0, 16, 32, 48, 64, 80, 80 + TOUCH_STILLNESS_MS + 1]),
    );
    expect(late?.kind).toBe('rest');
    expect(late?.pageReleasePxPerS).toBe(0);
    expect(
      touchPacingFault(
        FLICK,
        at([0, 16, 32, 48, 64, 80, 80 + TOUCH_STILLNESS_MS]),
      ),
    ).toBeNull();
  });

  it('leaves a rest the script makes to the script', () => {
    const resting = FLICK.map((step, i) =>
      i === 6 ? {...step, t: 80 + TOUCH_STILLNESS_MS + 20} : step,
    );
    expect(
      touchPacingFault(resting, at([0, 16, 32, 48, 64, 80, 400])),
    ).toBeNull();
  });

  it("calls a gap the page's when its listeners spent longer than the interval on the event before, and that handling accounts for the gap", () => {
    // The fourth event's listeners take 30 ms, so its successor reaches the
    // page 46 ms after it, in the interval the release weighs most.
    const arrivals = at([0, 16, 32, 48, 94, 110, 126]);
    const held = arrivals.map((a, i) =>
      i === 3 ? {...a, handledAt: a.stamp + 30} : a,
    );
    expect(touchPacingFault(FLICK, held, TOLERANCE)?.heldByPage).toEqual({
      gapMs: 46,
      handlingMs: 30,
    });
    // Handled within the interval, the same gap is the runner's.
    const quick = arrivals.map((a, i) =>
      i === 3 ? {...a, handledAt: a.stamp + 10} : a,
    );
    expect(touchPacingFault(FLICK, quick, TOLERANCE)?.heldByPage).toBeNull();
    // A gap the handling does not account for is the runner's too.
    const stalled = at([0, 16, 32, 48, 140, 156, 172]).map((a, i) =>
      i === 3 ? {...a, handledAt: a.stamp + 30} : a,
    );
    expect(touchPacingFault(FLICK, stalled, TOLERANCE)?.heldByPage).toBeNull();
  });
});

describe('touchArrivalsFrom', () => {
  it('gives each step one arrival: the earliest stamp of its pointer and touch events, and the latest handling', () => {
    expect(
      touchArrivalsFrom({
        eventTypes: ['pointerdown', 'touchstart', 'pointermove', 'touchmove'],
        pointerTypes: ['touch', '', 'touch', ''],
        stamps: [23, 24, 39, 100],
        handledAt: [23, 24, 100, 100],
      }),
    ).toEqual([
      {stamp: 23, handledAt: 24},
      {stamp: 39, handledAt: 100},
    ]);
  });

  it("leaves a mouse's pointer event out of a touch step", () => {
    expect(
      touchArrivalsFrom({
        eventTypes: ['pointermove', 'pointermove', 'touchmove'],
        pointerTypes: ['mouse', 'touch', ''],
        stamps: [5, 39, 39],
        handledAt: [90, 40, 40],
      }),
    ).toEqual([{stamp: 39, handledAt: 40}]);
  });

  it("reads a page whose pointer listener held each move as the page's rest, which the touch events alone hide", () => {
    // This is how WebKit recorded a page whose pointermove listener spins
    // 60 ms. The touch event is stamped once that listener is done. The next
    // step arrives 16 ms after it.
    const moves = [16, 92, 168, 244, 320];
    const record = {
      eventTypes: [
        'pointerdown',
        'touchstart',
        ...moves.flatMap(() => ['pointermove', 'touchmove']),
        'pointerup',
        'touchend',
      ],
      pointerTypes: [
        'touch',
        '',
        ...moves.flatMap(() => ['touch', '']),
        'touch',
        '',
      ],
      stamps: [0, 0, ...moves.flatMap(t => [t, t + 60]), 384, 384],
      handledAt: [0, 0, ...moves.flatMap(t => [t + 60, t + 60]), 384, 384],
    };
    const fault = touchPacingFault(FLICK, touchArrivalsFrom(record));
    expect(fault?.kind).toBe('rest');
    // Each move's 60 ms of handling held the 76 ms gap after it.
    expect(fault?.heldByPage).toEqual({gapMs: 76, handlingMs: 60});
    // The touch events alone read the lift 4 ms after the last move.
    const touchOnly = record.eventTypes
      .map((type, i) => ({type, i}))
      .filter(({type}) => type.startsWith('touch'))
      .map(({i}) => ({
        stamp: record.stamps[i],
        handledAt: record.handledAt[i],
      }));
    expect(touchPacingFault(FLICK, touchOnly)).toBeNull();
  });
});

describe('the pacing errors', () => {
  it("name the release the page read, the script's and the gaps", () => {
    const fault = touchPacingFault(
      FLICK,
      simulate('spacing', [1, 1, 1, 1, 20, 1, 1]),
      TOLERANCE,
    );
    if (fault == null) {
      throw new Error('expected a fault');
    }
    const error = new TouchPacingError(fault);
    expect(error.name).toBe('TouchPacingError');
    expect(error.message).toMatch(
      /the page read a release of 554 px\/s where the script throws 1000 px\/s \(gaps 35, 17, 16 ms where the script spaces 16, 16, 16 ms\): a dispatch stalled before the page/,
    );
    expect(error.fault).toBe(fault);
  });

  it("name the page's handling when its listeners held the gap", () => {
    const arrivals = at([0, 16, 32, 48, 94, 110, 126]).map((a, i) =>
      i === 3 ? {...a, handledAt: a.stamp + 30} : a,
    );
    const fault = touchPacingFault(FLICK, arrivals, TOLERANCE);
    if (fault?.heldByPage == null) {
      throw new Error('expected a fault the page held');
    }
    const error = new TouchPageStallError({
      ...fault,
      heldByPage: fault.heldByPage,
    });
    expect(error.name).toBe('TouchPageStallError');
    expect(error.message).toMatch(
      /the page's own touch and pointer listeners took 30 ms to handle an event, so the next reached it 46 ms later/,
    );
    expect(error.message).toMatch(
      /the page changed the release, not the runner/,
    );
  });
});
