// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file touch.pacing.test.ts
 * @input touch.ts's pacing rule, its reading of a paced play's release and
 *   its pacing errors
 * @output Unit cases: under `'schedule'` an event leaves at its scripted time
 *   from the start; under `'spacing'` its scripted interval after the event
 *   before it left. Under `'spacing'`, and on a WebKit `'schedule'` play, it
 *   also waits its interval, less 2 ms, after the event before was answered,
 *   so no gap reaches the page more than 2 ms short. The page's release (the
 *   last two move intervals, blended as core blends them) decides a paced play:
 *   an early stall leaves it intact; a short stall or a bunched pair at the end
 *   changes it, a fault only under a tolerance. A lift more than the stillness
 *   interval after the last move reads as rest, a fault unless the script rests
 *   too. A throw where the script rests is a fault, and so are fewer than two
 *   moves. A gap the page's own listeners held is the page's; a late send is
 *   the runner's. A scrolling surface's release also reads the interval
 *   before them. A release or a hold on the other side of a play's boundary
 *   from the script's is a fault. Each pacing error names the longest time
 *   the page drew no frame. A late gap that no page work explains, across
 *   which the page drew no frame, is the starved runner's.
 * @position Node unit tests beside the harness's browser self-tests.
 *
 * SYNC: When modified, update touch.ts (pacedDeadline, touchPacingFault,
 *   TouchPacingError, TouchPageStallError, TouchStarvationError,
 *   TouchLiftStallError,
 *   TOUCH_STILLNESS_MS, TOUCH_RELEASE_NEWEST_WEIGHT).
 */

import {describe, expect, it} from 'vitest';
import {pinch, toTouchEvents, type TouchEventStep} from './scripts';
import {
  ANSWER_SLACK_MS,
  pacedDeadline,
  readRelease,
  touchArrivalsFrom,
  TOUCH_STILLNESS_MS,
  touchPacingFault,
  touchPlayError,
  TouchLiftStallError,
  TouchPacingError,
  TouchPageStallError,
  TouchStarvationError,
  liftStallError,
  longestFrameGap,
  readHold,
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
 * `latencyMs[i]` later, when the page has it and has handled it. The page
 * stamps each event at that answer, the latest WebKit can.
 */
function simulate(
  pacing: TouchPacing,
  latencyMs: readonly number[],
  keepsGaps = false,
): TouchArrival[] {
  const origin = 1000;
  let now = origin;
  let previous: {sentAt: number; returnedAt: number} | null = null;
  return FLICK.map((_, index) => {
    now = Math.max(
      now,
      pacedDeadline(pacing, origin, FLICK, index, previous, keepsGaps),
    );
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

  it("keeps a WebKit 'schedule' play's gap, less 2 ms, after a late answer", () => {
    // Answered in time: at its scripted time.
    expect(
      pacedDeadline(
        'schedule',
        1000,
        FLICK,
        3,
        {sentAt: 1032, returnedAt: 1033},
        true,
      ),
    ).toBe(1048);
    // Answered at 1300: 14 ms after that answer.
    expect(
      pacedDeadline(
        'schedule',
        1000,
        FLICK,
        3,
        {sentAt: 1190, returnedAt: 1300},
        true,
      ),
    ).toBe(1314);
  });

  it("sends the first event at the start and the rest after the one before, under 'spacing'", () => {
    expect(pacedDeadline('spacing', 1000, FLICK, 0, null)).toBe(1000);
    // Answered within 2 ms: 16 ms after it left.
    expect(
      pacedDeadline('spacing', 1000, FLICK, 3, {
        sentAt: 1200,
        returnedAt: 1201,
      }),
    ).toBe(1216);
    // Answered after 5 ms: 14 ms after the answer, as the page may have
    // stamped the event that late.
    expect(
      pacedDeadline('spacing', 1000, FLICK, 3, {
        sentAt: 1200,
        returnedAt: 1205,
      }),
    ).toBe(1219);
    // Outlasted its interval: 14 ms after its answer.
    expect(
      pacedDeadline('spacing', 1000, FLICK, 3, {
        sentAt: 1200,
        returnedAt: 1300,
      }),
    ).toBe(1314);
  });

  it('never lets a page that stamps on arrival read a gap more than 2 ms short of the script', () => {
    // The closest two stamps can come is the earlier at its answer and the
    // later at its send. Answers here take 1 to 30 ms.
    const latency = [1, 5, 7, 30, 3, 8, 2];
    const shortest = (pacing: TouchPacing, keepsGaps: boolean) => {
      const sent: number[] = [];
      const answered: number[] = [];
      let now = 1000;
      for (const index of FLICK.keys()) {
        const previous =
          index > 0
            ? {sentAt: sent[index - 1], returnedAt: answered[index - 1]}
            : null;
        now = Math.max(
          now,
          pacedDeadline(pacing, 1000, FLICK, index, previous, keepsGaps),
        );
        sent.push(now);
        now += latency[index];
        answered.push(now);
      }
      return Math.min(
        ...sent
          .slice(1)
          .map((at, i) => at - answered[i] - (FLICK[i + 1].t - FLICK[i].t)),
      );
    };
    expect(shortest('spacing', false)).toBeGreaterThanOrEqual(-ANSWER_SLACK_MS);
    expect(shortest('schedule', true)).toBeGreaterThanOrEqual(-ANSWER_SLACK_MS);
    // A play that keeps its scripted times sends behind the 30 ms answer.
    expect(shortest('schedule', false)).toBeLessThan(-ANSWER_SLACK_MS);
  });
});

describe("touchPacingFault on a paced play's arrivals", () => {
  it("reads the script's release when every dispatch is answered within 2 ms", () => {
    const arrivals = simulate('spacing', [2, 2, 2, 2, 2, 2, 2]);
    expect(touchPacingFault(FLICK, arrivals, TOLERANCE)).toBeNull();
    expect(readRelease(FLICK, arrivals)?.pagePxPerS).toBeCloseTo(1000, 6);
  });

  it('reads a slower release, never a faster one, when every dispatch takes 5 ms', () => {
    // Each event waits 14 ms after the answer before it: 19 ms gaps.
    const arrivals = simulate('spacing', [5, 5, 5, 5, 5, 5, 5]);
    expect(touchPacingFault(FLICK, arrivals, TOLERANCE)).toBeNull();
    expect(readRelease(FLICK, arrivals)?.pagePxPerS).toBeCloseTo(842, 0);
  });

  it("reads a far faster release when a 'schedule' play that keeps its scripted times bursts the events behind a stall", () => {
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

  it("stretches a WebKit 'schedule' play behind a stall instead of bursting it", () => {
    // The same stall: each event behind it waits 14 ms after the answer
    // before it, so the release reads 15 ms intervals.
    const arrivals = simulate('schedule', [1, 1, 100, 1, 1, 1, 1], true);
    expect(touchPacingFault(FLICK, arrivals, TOLERANCE)).toBeNull();
    expect(readRelease(FLICK, arrivals)?.pagePxPerS).toBeCloseTo(1067, 0);
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

  it('reads 579 px/s for a 20 ms stall on the move before the last', () => {
    // Its gap stretches to 35 ms and the next leaves 14 ms after its answer:
    // 0.2 × 16 px/15 ms + 0.8 × 16 px/35 ms.
    const fault = touchPacingFault(
      FLICK,
      simulate('spacing', [1, 1, 1, 1, 20, 1, 1]),
      TOLERANCE,
    );
    expect(fault?.kind).toBe('release');
    expect(fault?.pageReleasePxPerS).toBeCloseTo(579, 0);
    expect(fault?.gapsMs).toEqual([35, 15, 16]);
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

  it("counts a listener's time from when it began, so an event's wait for the main thread before it is named as a wait, not the page's listeners", () => {
    // The fourth event waited 28 ms for the main thread, then its listeners
    // ran 2 ms: its successor reaches the page 46 ms after it.
    const arrivals = at([0, 16, 32, 48, 94, 110, 126]);
    const waited = arrivals.map((a, i) =>
      i === 3 ? {...a, startedAt: a.stamp + 28, handledAt: a.stamp + 30} : a,
    );
    const fault = touchPacingFault(FLICK, waited, TOLERANCE);
    expect(fault?.heldByPage).toBeNull();
    expect(fault?.waited).toEqual({gapMs: 46, waitMs: 28});
    expect(String(new TouchPacingError(fault!))).toMatch(
      /an event waited 28 ms for the main thread before the page's listeners began, so the next reached it 46 ms later: another page task held the thread, or the runner starved it/,
    );
    // Its listeners began at once and ran 30 ms: the page's.
    const listened = arrivals.map((a, i) =>
      i === 3 ? {...a, startedAt: a.stamp, handledAt: a.stamp + 30} : a,
    );
    expect(touchPacingFault(FLICK, listened, TOLERANCE)?.heldByPage).toEqual({
      gapMs: 46,
      handlingMs: 30,
    });
  });
});

describe("the release a paced play's page reads, as Core's velocity tracker reads it", () => {
  it('reads two moves that share a stamp as one, the later replacing the earlier, never Infinity', () => {
    // The fourth move arrives 16 ms late, at the fifth's stamp. Core keeps
    // the later sample: 16 px in 16 ms, then 32 px in 32 ms, 1,000 px/s.
    const arrivals = at([0, 16, 32, 48, 80, 80, 96]);
    expect(readRelease(FLICK, arrivals)?.pagePxPerS).toBeCloseTo(1000, 6);
    expect(touchPacingFault(FLICK, arrivals, TOLERANCE)).toBeNull();
  });

  it('reads 0 after a single move, for the page and the script alike', () => {
    const steps = [FLICK[0], FLICK[1], {...FLICK[6], t: 32}];
    const reading = readRelease(steps, at([0, 16, 32]));
    expect(reading?.pagePxPerS).toBe(0);
    expect(reading?.scriptPxPerS).toBe(0);
  });

  it('reads no fault for a single move, however late the lift: one move releases at 0 either way', () => {
    const steps = [FLICK[0], FLICK[1], {...FLICK[6], t: 32}];
    expect(touchPacingFault(steps, at([0, 16, 80]))).toBeNull();
  });

  it('fails a page that read a throw where the script rests before the lift', () => {
    // The flick lifts 50 ms after its last move, a rest. That move reaches
    // the page 15 ms late, 35 ms before the lift. So the page reads a throw:
    // 0.2 × 16 px in 31 ms + 0.8 × 16 px in 16 ms.
    const steps = [...FLICK.slice(0, 6), {...FLICK[6], t: 130}];
    const arrivals = at([0, 16, 32, 48, 64, 95, 130]);
    expect(readRelease(steps, arrivals)?.pagePxPerS).toBeCloseTo(903.2, 1);
    const fault = touchPacingFault(steps, arrivals);
    expect(fault?.kind).toBe('throw');
    expect(fault?.scriptReleasePxPerS).toBe(0);
  });

  it('fails a page that read every move at one stamp: with fewer than two moves it reads 0', () => {
    const fault = touchPacingFault(FLICK, at([0, 80, 80, 80, 80, 80, 96]));
    expect(fault?.kind).toBe('moves');
    expect(fault?.pageReleasePxPerS).toBe(0);
    expect(fault?.scriptReleasePxPerS).toBeCloseTo(1000, 6);
  });
});

describe('touchArrivalsFrom', () => {
  it('gives each step one arrival: a move and a lift at their pointer events, a touch-down at its touch event, and the latest handling', () => {
    expect(
      touchArrivalsFrom({
        eventTypes: [
          'pointerdown',
          'touchstart',
          'pointermove',
          'touchmove',
          'pointerup',
          'touchend',
        ],
        pointerTypes: ['touch', '', 'touch', '', 'touch', ''],
        stamps: [23, 24, 39, 100, 116, 140],
        handledAt: [23, 24, 100, 100, 140, 140],
      }),
    ).toEqual([
      {stamp: 24, firstStamp: 23, handledAt: 24},
      {stamp: 39, firstStamp: 39, handledAt: 100},
      {stamp: 116, firstStamp: 116, handledAt: 140},
    ]);
  });

  it('reads a lift with no pointer event at its touchend', () => {
    expect(
      touchArrivalsFrom({
        eventTypes: ['touchstart', 'touchmove', 'touchend'],
        pointerTypes: ['', '', ''],
        stamps: [24, 39, 140],
        handledAt: [24, 39, 140],
      }).at(-1),
    ).toEqual({stamp: 140, firstStamp: 140, handledAt: 140});
  });

  it("reads a lift at its pointerup, as the gesture host does: a pointerup listener that holds the touchend is not the page's rest", () => {
    // How WebKit recorded a Carousel flick on a loaded runner. The pointerup
    // came 4 ms after the last move. Its listeners finished 49 ms later, when
    // WebKit stamped the touchend. The gesture host reads the lift at the
    // pointerup, paired with the moves.
    const record = {
      eventTypes: [
        'pointerdown',
        'touchstart',
        ...[0, 1, 2, 3, 4].flatMap(() => ['pointermove', 'touchmove']),
        'pointerup',
        'touchend',
      ],
      pointerTypes: [
        'touch',
        '',
        ...[0, 1, 2, 3, 4].flatMap(() => ['touch', '']),
        'touch',
        '',
      ],
      stamps: [
        3097, 3099, 3116, 3121, 3146, 3149, 3180, 3185, 3246, 3255, 3294, 3295,
        3298, 3347,
      ],
      handledAt: [
        3099, 3102, 3121, 3121, 3149, 3150, 3185, 3185, 3255, 3255, 3295, 3295,
        3347, 3355,
      ],
    };
    const arrivals = touchArrivalsFrom(record);
    expect(arrivals.at(-1)).toEqual({
      stamp: 3298,
      firstStamp: 3298,
      handledAt: 3355,
    });
    expect(touchPacingFault(FLICK, arrivals)).toBeNull();
  });

  it("leaves a mouse's pointer event out of a touch step", () => {
    expect(
      touchArrivalsFrom({
        eventTypes: ['pointermove', 'pointermove', 'touchmove'],
        pointerTypes: ['mouse', 'touch', ''],
        stamps: [5, 39, 39],
        handledAt: [90, 40, 40],
      }),
    ).toEqual([{stamp: 39, firstStamp: 39, handledAt: 40}]);
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
      /the page read a release of 579 px\/s where the script throws 1000 px\/s \(gaps 35, 15, 16 ms where the script spaces 16, 16, 16 ms\): a dispatch stalled before the page/,
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
      /the page's own touch and pointer listeners took 30 ms of page wall time to handle an event, so the next reached it 46 ms later/,
    );
    expect(error.message).toMatch(
      /On a starved runner that time includes the page's wait for a CPU: judge a page stall from a run with CI's CPU limits/,
    );
    expect(error.message).not.toMatch(/not the runner/);
  });
});

describe('liftStallError', () => {
  // The flick's last move is its step 5; its lift, step 6, comes 16 ms later.
  const onEventAt5 = (ms: number) => [0, 0, 0, 0, 0, ms, 0];
  const lateLift = at([0, 16, 32, 48, 64, 80, 200]);

  it('names the lift stall when onEvent alone carries the gap past the stillness interval, however much later a loaded runner made the lift', () => {
    const fault = touchPacingFault(FLICK, lateLift);
    if (fault?.kind !== 'rest') {
      throw new Error('expected the page to read a rest');
    }
    // onEvent ran 70 ms of the 120 ms gap; the runner stretched the rest.
    const error = liftStallError(FLICK, lateLift, fault, onEventAt5(70));
    expect(error).toBeInstanceOf(TouchLiftStallError);
    expect(error?.numbers).toMatchObject({
      scriptedGapMs: 16,
      gapMs: 120,
      onEventMs: 70,
    });
  });

  it('leaves a lift that onEvent cannot carry past the interval to the pacing errors', () => {
    const fault = touchPacingFault(FLICK, lateLift);
    if (fault == null) {
      throw new Error('expected a fault');
    }
    const below = TOUCH_STILLNESS_MS - 16;
    expect(liftStallError(FLICK, lateLift, fault, onEventAt5(5))).toBeNull();
    expect(
      liftStallError(FLICK, lateLift, fault, onEventAt5(below)),
    ).toBeNull();
    expect(
      liftStallError(FLICK, lateLift, fault, onEventAt5(below + 1)),
    ).toBeInstanceOf(TouchLiftStallError);
  });
});

describe('touchPlayError', () => {
  // The lift reaches the page 120 ms after the last move, step 5, where the
  // script spaces 16 ms: the page reads a resting finger.
  const lateLift = at([0, 16, 32, 48, 64, 80, 200]);
  const heldLift = lateLift.map((a, i) =>
    i === 5 ? {...a, handledAt: a.stamp + 110} : a,
  );
  const quick = [0, 0, 0, 0, 0, 0, 0];
  const slowAt5 = [0, 0, 0, 0, 0, 70, 0];
  const errorFor = (arrivals: TouchArrival[], onEventMs: number[]) => {
    const fault = touchPacingFault(FLICK, arrivals);
    if (fault?.kind !== 'rest') {
      throw new Error('expected the page to read a rest');
    }
    return touchPlayError(FLICK, arrivals, fault, onEventMs);
  };

  it("names the runner's dispatch stall when onEvent is quick and the page's listeners did not hold the lift", () => {
    const error = errorFor(lateLift, quick);
    expect(error).toBeInstanceOf(TouchPacingError);
    expect((error as TouchPacingError).fault.heldByPage).toBeNull();
  });

  it("names the page's stall when its listeners held the lift and onEvent is quick", () => {
    expect(errorFor(heldLift, quick)).toBeInstanceOf(TouchPageStallError);
  });

  it('names the lift stall first when onEvent alone carries the gap past the stillness interval', () => {
    expect(errorFor(lateLift, slowAt5)).toBeInstanceOf(TouchLiftStallError);
    expect(errorFor(heldLift, slowAt5)).toBeInstanceOf(TouchLiftStallError);
  });
});

describe('touchPlayError on a starved runner', () => {
  // The lift reaches the page 120 ms after the last move, step 5, where the
  // script spaces 16 ms: the page reads a resting finger.
  const lateLift = at([0, 16, 32, 48, 64, 80, 200]);
  const quick = [0, 0, 0, 0, 0, 0, 0];
  // The page drew no frame from 78 ms to 230 ms, across the lift's gap.
  const starved = [0, 16, 33, 48, 64, 78, 230];
  const errorFor = (
    arrivals: TouchArrival[],
    frames: number[],
    onEventMs = quick,
  ) => {
    const fault = touchPacingFault(FLICK, arrivals);
    if (fault?.kind !== 'rest') {
      throw new Error('expected the page to read a rest');
    }
    return touchPlayError(FLICK, arrivals, fault, onEventMs, frames);
  };

  it('names the starved runner when the page drew no frame across the late gap, and no page work held the event', () => {
    const error = errorFor(lateLift, starved);
    expect(error).toBeInstanceOf(TouchStarvationError);
    expect(error.message).toMatch(
      /the page drew no frame for 152 ms across a 120 ms gap where the script spaces 16 ms, and the page read a resting finger/,
    );
    expect(error.message).toMatch(
      /the runner starved the page\. Judge the proof from a run with CI's CPU limits/,
    );
  });

  it('keeps a dispatch that stalled while the page drew frames a TouchPacingError', () => {
    const drawing = Array.from({length: 15}, (_, k) => 16 * k);
    expect(errorFor(lateLift, drawing)).toBeInstanceOf(TouchPacingError);
  });

  it("reads the frames across the late gap, not the gesture's longest frame gap", () => {
    // No frame for 70 ms at the start, then one every 16 ms across the lift.
    const earlyGap = [0, 70, 86, 102, 118, 134, 150, 166, 182, 198, 214];
    expect(longestFrameGap(earlyGap, lateLift)).toBe(70);
    expect(errorFor(lateLift, earlyGap)).toBeInstanceOf(TouchPacingError);
  });

  it("keeps a gap the page's listeners held the page's, though the page drew nothing", () => {
    const heldLift = lateLift.map((a, i) =>
      i === 5 ? {...a, handledAt: a.stamp + 110} : a,
    );
    expect(errorFor(heldLift, starved)).toBeInstanceOf(TouchPageStallError);
  });

  it('keeps a wait for the main thread a TouchPacingError that names the wait, though the page drew nothing', () => {
    // A page task held the main thread 100 ms before the last move's listeners.
    const waitedLift = lateLift.map((a, i) =>
      i === 5 ? {...a, startedAt: a.stamp + 100, handledAt: a.stamp + 104} : a,
    );
    const error = errorFor(waitedLift, starved);
    expect(error).toBeInstanceOf(TouchPacingError);
    expect(error.message).toMatch(
      /an event waited 100 ms for the main thread before the page's listeners began/,
    );
  });

  it('names the lift stall first when onEvent alone carries the gap past the stillness interval', () => {
    expect(errorFor(lateLift, starved, [0, 0, 0, 0, 0, 70, 0])).toBeInstanceOf(
      TouchLiftStallError,
    );
  });

  it("names the starved runner for a pinch's late lift too", () => {
    const steps = toTouchEvents(
      pinch({
        center: {x: 200, y: 300},
        fromDistance: 100,
        toDistance: 200,
        durationMs: 100,
        hz: 60,
      }),
    );
    const lift = steps.length - 1;
    // Every step at its scripted time, but the lift 60 ms late.
    const arrivals = at(steps.map((step, i) => step.t + (i === lift ? 60 : 0)));
    const fault = touchPacingFault(steps, arrivals);
    if (fault?.kind !== 'rest') {
      throw new Error('expected the page to read a rest');
    }
    const lastMove = arrivals[lift - 1].stamp;
    const frames = [0, 16, 33, 50, 66, 83, lastMove - 1, lastMove + 120];
    const error = touchPlayError(steps, arrivals, fault, [], frames);
    expect(error).toBeInstanceOf(TouchStarvationError);
    expect((error as TouchStarvationError).fault.late.index).toBe(lift);
  });
});

describe('boundaries, the scroll release and frame evidence', () => {
  // The third move reaches the page 20 ms late; the moves after it keep the
  // script's 16 ms.
  const lateThird = at([0, 16, 32, 68, 84, 100, 116]);

  it("reads a scrolling surface's release from the interval before the pan's two", () => {
    expect(readRelease(FLICK, lateThird)?.pagePxPerS).toBeCloseTo(1000, 6);
    // 0.25 x 1,000 + 0.75 x (0.2 x 1,000 + 0.8 x 444.4).
    expect(readRelease(FLICK, lateThird, 'scroll')?.pagePxPerS).toBeCloseTo(
      666.67,
      1,
    );
    expect(readRelease(FLICK, lateThird, 'scroll')?.scriptPxPerS).toBeCloseTo(
      1000,
      6,
    );
  });

  it('fails a release on the other side of the boundary from the script, and only then', () => {
    const fault = touchPacingFault(FLICK, lateThird, undefined, {
      release: 'scroll',
      boundaries: {releasePxPerS: 800},
    });
    expect(fault?.kind).toBe('boundary');
    expect(fault?.threshold).toBe(800);
    expect(new TouchPacingError(fault!).message).toMatch(
      /the page read a release of 667 px\/s where the script throws 1000 px\/s, on the other side of the 800 px\/s the component decides on \(gaps 36, 16, 16, 16 ms where the script spaces 16, 16, 16, 16 ms\)/,
    );
    // The pan's release reads the script's, and 667 px/s is past 600.
    expect(
      touchPacingFault(FLICK, lateThird, undefined, {
        boundaries: {releasePxPerS: 800},
      }),
    ).toBeNull();
    expect(
      touchPacingFault(FLICK, lateThird, undefined, {
        release: 'scroll',
        boundaries: {releasePxPerS: 600},
      }),
    ).toBeNull();
  });

  it('fails a hold on the other side of the boundary from the script, and only then', () => {
    const finger = {id: 0, x: 100, y: 50};
    const tap: TouchEventStep[] = [
      {t: 0, type: 'touchStart', fingers: [finger], changed: [finger]},
      {t: 40, type: 'touchEnd', fingers: [], changed: [finger]},
    ];
    expect(readHold(tap, at([0, 97]))).toEqual({page: 97, script: 40});
    const fault = touchPacingFault(tap, at([0, 97]), undefined, {
      boundaries: {holdMs: 85},
    });
    expect(fault?.kind).toBe('hold');
    expect(new TouchPacingError(fault!).message).toMatch(
      /the page read a hold of 97 ms where the script holds 40 ms, on the other side of the 85 ms the component decides on/,
    );
    expect(
      touchPacingFault(tap, at([0, 60]), undefined, {boundaries: {holdMs: 85}}),
    ).toBeNull();
    const long = tap.map((step, i) => (i === 1 ? {...step, t: 150} : step));
    expect(
      touchPacingFault(long, at([0, 140]), undefined, {
        boundaries: {holdMs: 85},
      }),
    ).toBeNull();
  });

  it('names the longest time the page drew no frame during the gesture', () => {
    const frames = [0, 16, 33, 50, 226, 243];
    expect(longestFrameGap(frames, at([20, 36, 52, 230]))).toBe(176);
    expect(longestFrameGap([], at([20, 230]))).toBeNull();
    // No frame before the gesture: the gap runs from its first touch.
    expect(longestFrameGap([381, 397, 408, 424], at([261, 420]))).toBe(120);
    const fault = touchPacingFault(FLICK, lateThird, undefined, {
      release: 'scroll',
      boundaries: {releasePxPerS: 800},
    });
    expect(new TouchPacingError({...fault!, frameGapMs: 176}).message).toMatch(
      /; the page drew no frame for 176 ms during the gesture: /,
    );
    const lift = {scriptedGapMs: 16, gapMs: 120, onEventMs: 104};
    expect(new TouchLiftStallError({...lift, frameGapMs: 176}).message).toMatch(
      /back; the page drew no frame for 176 ms during the gesture\. /,
    );
    expect(new TouchLiftStallError(lift).message).not.toMatch(/drew no frame/);
  });
});
