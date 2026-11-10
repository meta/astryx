// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file webInput.pacing.test.ts
 * @input webInput.ts's wheel pacing errors
 * @output Unit cases. A wheel burst is judged on its steps' own stamps, the
 *   clock Core's gesture host reads. A gap past its bound is the page's when
 *   two things hold. The page's handling of the step before caused it, and it
 *   is wider than the harness's send spacing. Otherwise the gap is the
 *   dispatch's. A release the page read off the script's is the dispatch's.
 *   Each error names its numbers.
 * @position Node unit tests beside the harness's browser self-tests.
 *
 * SYNC: When modified, update webInput.ts (wheelStamps, wheelSendGaps, wheelGapCauses,
 *   wheelReleaseRead, wheelReleaseStrays, WheelPacingError, WheelPageStallError).
 */

import {describe, expect, it} from 'vitest';
import {
  wheelGapCauses,
  wheelReleaseHold,
  wheelReleaseRead,
  wheelReleaseStrays,
  wheelSendGaps,
  wheelStamps,
  WheelPacingError,
  WheelPageStallError,
} from './webInput';

describe('WheelPacingError', () => {
  it('names the longest gap, the bound and every gap', () => {
    const error = new WheelPacingError(100, [16, 16, 141, 0, 16]);
    expect(error.name).toBe('WheelPacingError');
    expect(error.message).toMatch(/a gap of 141 ms, at or over its 100 ms/);
    expect(error.message).toMatch(/gaps 16, 16, 141, 0, 16 ms/);
    expect(error.receivedGapsMs).toEqual([16, 16, 141, 0, 16]);
  });
});

describe('wheelStamps', () => {
  it('maps an epoch stamp through the time origin, and keeps a stamp on the page clock', () => {
    expect(
      wheelStamps([1_700_000_000_120, 1_700_000_000_136], 1_700_000_000_000),
    ).toEqual([120, 136]);
    expect(wheelStamps([120, 136], 1_700_000_000_000)).toEqual([120, 136]);
  });

  it('finds no split where WebKit coalesced the held steps under the older stamp, as the host reads one gesture', () => {
    // The listener held the main thread 150 ms on the first step. WebKit
    // coalesced the steps it held into one, stamped like the step before.
    expect(wheelGapCauses('webkit', [133, 133], [284, 434], 100)).toEqual({
      pageStalls: [],
      dispatchStalls: [],
    });
  });

  it('gives the page the gap after a coalesced step, stamped once its listener freed the thread', () => {
    // The first step's listener held the main thread 150 ms. The coalesced
    // step arrived as it finished; the next step was stamped 4 ms later.
    expect(
      wheelGapCauses(
        'webkit',
        [133, 133, 290],
        [284, 286, 291],
        100,
        [16, 16],
        [],
        [134, 284, 290],
      ),
    ).toEqual({
      pageStalls: [{gapMs: 157, handlingMs: 152}],
      dispatchStalls: [],
    });
  });

  it('splits a burst whose stamps carry the end window though its steps arrived 16 ms apart', () => {
    // A starved WebKit stamped the third step 234 ms after the second, while
    // the page received the steps on the burst's pace. The host reads the
    // stamps, so it saw two scrolls.
    const frames = Array.from({length: 20}, (_, k) => 16 * k);
    expect(
      wheelGapCauses(
        'webkit',
        [0, 16, 250, 266],
        [1, 17, 251, 267],
        220,
        [16, 16, 16],
        frames,
      ),
    ).toEqual({pageStalls: [], dispatchStalls: [234]});
  });
});

describe('wheelGapCauses', () => {
  it('finds nothing within the bound', () => {
    expect(
      wheelGapCauses('webkit', [0, 16, 32, 48], [1, 17, 33, 49], 100),
    ).toEqual({pageStalls: [], dispatchStalls: []});
  });

  it('judges a gap of exactly the bound, as Core ends a wheel gesture at a pause of its end window or more', () => {
    // WebKit stamps whole ms, so a gap can equal the bound exactly.
    expect(wheelGapCauses('webkit', [0, 16, 116], [1, 17, 117], 100)).toEqual({
      pageStalls: [],
      dispatchStalls: [100],
    });
    expect(wheelGapCauses('chromium', [0, 16, 116], [1, 17, 117], 100)).toEqual(
      {pageStalls: [], dispatchStalls: [100]},
    );
    // Just under the bound, the run stays one gesture.
    expect(
      wheelGapCauses('chromium', [0, 16, 115.9], [1, 17, 116.9], 100),
    ).toEqual({pageStalls: [], dispatchStalls: []});
  });

  it('gives a WebKit gap to the page when the step reached it within a frame of the listeners finishing the one before', () => {
    // The listeners held the main thread 150 ms on the first step; the next
    // was dispatched 2 ms after they finished.
    expect(
      wheelGapCauses('webkit', [0, 152, 168], [150, 153, 169], 100),
    ).toEqual({
      pageStalls: [{gapMs: 152, handlingMs: 150}],
      dispatchStalls: [],
    });
  });

  it('gives a WebKit gap to the dispatch when the page sat free before the step arrived', () => {
    // A 30 ms listener, steps 125 ms apart: the page was free 95 ms before
    // each next step.
    expect(
      wheelGapCauses('webkit', [0, 125, 250], [30, 155, 280], 100),
    ).toEqual({
      pageStalls: [],
      dispatchStalls: [125, 125],
    });
  });

  it('gives every Chromium gap to the dispatch, whose stamps the page cannot move', () => {
    expect(
      wheelGapCauses('chromium', [0, 120, 240], [25, 145, 265], 100),
    ).toEqual({pageStalls: [], dispatchStalls: [120, 120]});
    expect(
      wheelGapCauses('chromium', [0, 152, 168], [150, 153, 169], 100),
    ).toEqual({pageStalls: [], dispatchStalls: [152]});
  });

  it('gives a WebKit gap to the page, naming its frame gap, when the page drew no frame across it with its listeners idle', () => {
    // The listeners took 1 ms; the page then drew no frame from 20 to 380,
    // across the 360 ms gap between the steps.
    const frames = [4, 20, 380, 396];
    expect(
      wheelGapCauses('webkit', [16, 376], [17, 377], 100, [16], frames),
    ).toEqual({
      pageStalls: [{gapMs: 360, handlingMs: 1, frameGapMs: 360}],
      dispatchStalls: [],
    });
    // With frames running through the same gap, it is the dispatch's.
    const running = Array.from({length: 26}, (_, k) => 4 + 16 * k);
    expect(
      wheelGapCauses('webkit', [16, 376], [17, 377], 100, [16], running),
    ).toEqual({pageStalls: [], dispatchStalls: [360]});
    // A gap no wider than the harness's own send spacing stays the
    // dispatch's, frames or not.
    expect(
      wheelGapCauses('webkit', [16, 376], [17, 377], 100, [360], frames),
    ).toEqual({pageStalls: [], dispatchStalls: [360]});
    // Chromium's stamps are its dispatch's.
    expect(
      wheelGapCauses('chromium', [16, 376], [17, 377], 100, [16], frames),
    ).toEqual({pageStalls: [], dispatchStalls: [360]});
  });

  it('counts a step whose handling was never seen as the dispatch\u2019s', () => {
    expect(wheelGapCauses('webkit', [0, 150], [Number.NaN, 151], 100)).toEqual({
      pageStalls: [],
      dispatchStalls: [150],
    });
  });
});

describe('wheelSendGaps', () => {
  it('spaces each received gap by when the harness sent the two steps', () => {
    expect(
      wheelSendGaps(
        Array.from({length: 4}, () => ({dx: 10})),
        [0, 400, 801, 1200],
        Array.from({length: 4}, (): [number, number] => [10, 0]),
      ),
    ).toEqual([400, 401, 399]);
  });

  it('spaces a coalesced step from the first sent step it carries', () => {
    // WebKit held three steps and delivered them as one 30 px step: the page
    // could have held the first of them, sent 16 ms after the step before.
    expect(
      wheelSendGaps(
        Array.from({length: 4}, () => ({dy: 10})),
        [0, 16, 32, 48],
        [
          [0, 10],
          [0, 30],
        ],
      ),
    ).toEqual([16]);
  });

  it('leaves a gap unknown when the received deltas match no sent step', () => {
    expect(
      wheelSendGaps(
        [{dx: 10}, {dx: 10}],
        [0, 16],
        [
          [10, 0],
          [7, 0],
        ],
      ),
    ).toEqual([null]);
  });
});

describe('wheelGapCauses with the send spacing', () => {
  it('gives a held-back WebKit gap to the dispatch when it is no wider than the harness sent the steps', () => {
    // Steps sent 400 ms apart: the first reached the page 290 ms late, a
    // starved renderer then held the page 64 ms past its 30 ms listener, and
    // the second arrived as the page came free, 111 ms after the first.
    expect(wheelGapCauses('webkit', [0, 111], [96, 141], 100, [400])).toEqual({
      pageStalls: [],
      dispatchStalls: [111],
    });
  });

  it('gives the page a stall behind a late first step, whose coalesced steps were sent at the burst pace', () => {
    // 19 steps sent 16 ms apart; the first reached the page 290 ms late, the
    // listener then held the page 150 ms, and steps 1 to 18 arrived coalesced
    // as it finished.
    const steps = Array.from({length: 19}, () => ({dy: 10}));
    const sentAt = steps.map((_, i) => 16 * i);
    const sendGaps = wheelSendGaps(steps, sentAt, [
      [0, 10],
      [0, 180],
    ]);
    expect(sendGaps).toEqual([16]);
    expect(
      wheelGapCauses('webkit', [290, 442], [440, 443], 100, sendGaps),
    ).toEqual({
      pageStalls: [{gapMs: 152, handlingMs: 150}],
      dispatchStalls: [],
    });
  });

  it('still gives the page a gap its listener widened past the send spacing', () => {
    // A 150 ms listener on steps sent 16 ms apart.
    expect(
      wheelGapCauses('webkit', [0, 152, 168], [150, 153, 169], 100, [16, 16]),
    ).toEqual({
      pageStalls: [{gapMs: 152, handlingMs: 150}],
      dispatchStalls: [],
    });
  });

  it('keeps the one-frame rule where the send spacing is unknown', () => {
    expect(wheelGapCauses('webkit', [0, 152], [150, 153], 100, [null])).toEqual(
      {
        pageStalls: [{gapMs: 152, handlingMs: 150}],
        dispatchStalls: [],
      },
    );
  });
});

describe('wheelGapCauses with arrivals', () => {
  it('gives the page a gap its main thread held without its listeners, by the frames it did not draw', () => {
    // The first step queued a 150 ms task. WebKit stamped the second step at
    // 96 but delivered it at 247, and stamped the third once the page was
    // free. The listeners took 1 ms; no frame ran from 94 to 247.
    expect(
      wheelGapCauses(
        'webkit',
        [95, 96, 253, 253],
        [97, 247, 253, 254],
        100,
        [16, 16, 16],
        [94, 247, 252],
        [96, 247, 253, 253],
      ),
    ).toEqual({
      pageStalls: [{gapMs: 157, handlingMs: 1, frameGapMs: 153}],
      dispatchStalls: [],
    });
  });
});

describe('wheelGapCauses with a send spacing past the bound', () => {
  it('gives a gap the harness sent past the bound to the dispatch, though the page held the step back', () => {
    expect(wheelGapCauses('webkit', [0, 300], [290, 301], 100, [180])).toEqual({
      pageStalls: [],
      dispatchStalls: [300],
    });
  });

  it('gives it to the dispatch though the page drew no frame across it', () => {
    expect(
      wheelGapCauses(
        'webkit',
        [0, 300],
        [Number.NaN, 301],
        100,
        [180],
        [0, 300],
      ),
    ).toEqual({pageStalls: [], dispatchStalls: [300]});
  });

  it('still gives the page a held-back gap the harness sent within the bound', () => {
    expect(wheelGapCauses('webkit', [0, 300], [290, 301], 100, [60])).toEqual({
      pageStalls: [{gapMs: 300, handlingMs: 290}],
      dispatchStalls: [],
    });
  });
});

/** Twelve trackpad steps, shrinking after the fourth, sent a frame apart. */
const RELEASE_STEPS = [12, 12, 12, 12, 11, 10, 9, 8, 7, 6, 5, 4].map(dx => ({
  dx,
}));
const SENT = RELEASE_STEPS.map((_, i) => 16 * i);
const DELTAS = RELEASE_STEPS.map(({dx}): [number, number] => [dx, 0]);
/** A proof whose pan must carry the fingers 18 px past their last move. */
const RELEASE = {readStep: 3, liftStep: 7, carryPx: {min: 18}};

/** Stamps from gaps, starting at 0. */
function stampsFrom(gaps: readonly number[]): number[] {
  return gaps.reduce<number[]>(
    (stamps, gap) => [...stamps, stamps.at(-1)! + gap],
    [0],
  );
}

describe('wheelReleaseRead', () => {
  it('reads the same release from the stamps as from the schedule when the page stamped the steps on pace', () => {
    const read = wheelReleaseRead(RELEASE_STEPS, SENT, SENT, DELTAS, RELEASE)!;
    expect(read).toMatchObject({
      scriptPxPerS: 750,
      pagePxPerS: 750,
      scriptCarryMs: 64,
      pageCarryMs: 64,
      scriptCarryPx: 48,
      pageCarryPx: 48,
      merged: null,
      stepwiseMerge: null,
    });
    expect(wheelReleaseStrays(read)).toBe(false);
  });

  it('names a carry the stamps cut short past the proof\u2019s bar, read exactly as the host read it', () => {
    // Logged under load, every step on its own: step 3 came 40 ms after step
    // 2, 300 px/s, and the lift 51 ms later. The host ended 15.3 px past the
    // fingers' travel, as this read does.
    const stamps = [0, 23, 35, 75, 111, 122, 122, 126, 151, 167, 167, 174];
    const read = wheelReleaseRead(
      RELEASE_STEPS,
      SENT,
      stamps,
      DELTAS,
      RELEASE,
    )!;
    expect(read.pagePxPerS).toBe(300);
    expect(read.pageCarryMs).toBe(51);
    expect(read.pageCarryPx).toBeCloseTo(15.3, 9);
    expect(wheelReleaseStrays(read)).toBe(true);
  });

  it('names a slow read with a squeezed carry, which a window average would miss', () => {
    // 60 ms for the read step, then 40 ms to the lift: 100 ms for steps 3 to
    // 7, near the script's 80. The read is a fifth of the script's speed.
    const stamps = stampsFrom([16, 16, 60, 10, 10, 10, 10, 16, 16, 16, 16]);
    const read = wheelReleaseRead(
      RELEASE_STEPS,
      SENT,
      stamps,
      DELTAS,
      RELEASE,
    )!;
    expect(read.pagePxPerS).toBe(200);
    expect(read.pageCarryPx).toBe(8);
    expect(wheelReleaseStrays(read)).toBe(true);
  });

  it('passes a read off the script\u2019s that stays on the script\u2019s side of the bar', () => {
    // The carry is 30 ms where the script's is 64: 22.5 px, still past 18.
    const stamps = stampsFrom([16, 16, 16, 8, 7, 8, 7, 16, 16, 16, 16]);
    const read = wheelReleaseRead(
      RELEASE_STEPS,
      SENT,
      stamps,
      DELTAS,
      RELEASE,
    )!;
    expect(read.pageCarryPx).toBe(22.5);
    expect(wheelReleaseStrays(read)).toBe(false);
  });

  it('passes a step stamped late before the release, which leaves the read intact', () => {
    const stamps = stampsFrom([60, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16]);
    const read = wheelReleaseRead(
      RELEASE_STEPS,
      SENT,
      stamps,
      DELTAS,
      RELEASE,
    )!;
    expect(read.pageCarryPx).toBe(48);
    expect(wheelReleaseStrays(read)).toBe(false);
  });

  it('joins a held step bunched right after the read to its reading, up to the speed before it', () => {
    // Logged under load: step 3 read 12 px over 32 ms, 375 px/s. Step 4 came
    // in the same ms, so the host read 23 px over those 32 ms, 719 px/s. That
    // stays under step 2's 800 px/s, and carried 22.3 px to the lift.
    const stamps = [0, 32, 47, 79, 79, 99, 110, 110, 128, 143, 171, 184];
    const read = wheelReleaseRead(
      RELEASE_STEPS,
      SENT,
      stamps,
      DELTAS,
      RELEASE,
    )!;
    expect(read.pagePxPerS).toBe(718.75);
    expect(read.pageCarryMs).toBe(31);
    expect(read.pageCarryPx).toBeCloseTo(22.28, 2);
    expect(wheelReleaseStrays(read)).toBe(false);
  });

  it('ends the reading at a held step with its own time, so a later bunch joins nothing', () => {
    // Step 4 came 10 ms after the read and step 5 bunched with it: the speed
    // stays step 3's 375 px/s.
    const stamps = [0, 32, 47, 79, 89, 89, 110, 120, 136, 152, 168, 184];
    const read = wheelReleaseRead(
      RELEASE_STEPS,
      SENT,
      stamps,
      DELTAS,
      RELEASE,
    )!;
    expect(read.pagePxPerS).toBe(375);
    expect(read.pageCarryPx).toBe(15.375);
    expect(wheelReleaseStrays(read)).toBe(true);
  });

  it('joins a read step bunched with the one before to that reading, up to the speed before it', () => {
    // Steps 2 and 3 came in the same ms. Their joined reading, 24 px over 16
    // ms, is held to step 1's 750 px/s, carried from step 3 to step 5.
    const stamps = stampsFrom([16, 16, 0, 32, 16, 16, 16, 16, 16, 16, 16]);
    const read = wheelReleaseRead(RELEASE_STEPS, SENT, stamps, DELTAS, {
      readStep: 3,
      liftStep: 5,
      carryPx: {max: 57},
    })!;
    expect(read.pagePxPerS).toBe(750);
    expect(read.pageCarryPx).toBe(36);
    expect(wheelReleaseStrays(read)).toBe(false);
  });

  it('names a merge inside the steps the release reads, which the host decays its own way', () => {
    // Logged under load: steps 5 to 7 arrived as one 27 px wheel. The host
    // ended 8.3 px past the fingers' travel, where no reading of the steps
    // gives that.
    const logged = [
      ...DELTAS.slice(0, 5),
      [27, 0] as [number, number],
      ...DELTAS.slice(8),
    ];
    const stamps = [0, 0, 82, 82, 98, 98, 125, 139, 148, 197];
    const read = wheelReleaseRead(
      RELEASE_STEPS,
      SENT,
      stamps,
      logged,
      RELEASE,
    )!;
    expect(read.merged).toEqual([5, 7]);
    expect(wheelReleaseStrays(read)).toBe(true);
  });

  it('names a merge inside those steps whether bunched or not', () => {
    // Steps 5 and 6 arrived as one 19 px wheel.
    const inside = [
      ...DELTAS.slice(0, 5),
      [19, 0] as [number, number],
      ...DELTAS.slice(7),
    ];
    const gaps = (gap: number) =>
      stampsFrom([16, 16, 16, 16, gap, 16, 16, 16, 16, 16]);
    for (const gap of [16, 0]) {
      const read = wheelReleaseRead(
        RELEASE_STEPS,
        SENT,
        gaps(gap),
        inside,
        RELEASE,
      )!;
      expect(read.merged).toEqual([5, 6]);
      expect(wheelReleaseStrays(read)).toBe(true);
    }
  });

  it('names a merge across the read and the lift', () => {
    // Steps 3 to 8 arrived as one wheel, stamped like step 2.
    const merged = [
      ...DELTAS.slice(0, 3),
      [57, 0] as [number, number],
      ...DELTAS.slice(9),
    ];
    const stamps = [0, 16, 32, 32, 160, 176, 192];
    const read = wheelReleaseRead(
      RELEASE_STEPS,
      SENT,
      stamps,
      merged,
      RELEASE,
    )!;
    expect(read.merged).toEqual([3, 8]);
    expect(wheelReleaseStrays(read)).toBe(true);
  });

  it('judges a merge after the lift by the carry, which it leaves exact', () => {
    // Logged under load: steps 10 and 11 arrived as one 9 px wheel in the
    // glide. The host ended 37.26 px past the fingers' travel, as this read
    // does.
    const logged = [...DELTAS.slice(0, 10), [9, 0] as [number, number]];
    const stamps = [0, 43, 43, 62, 84, 84, 103, 121, 132, 217, 217];
    const read = wheelReleaseRead(
      RELEASE_STEPS,
      SENT,
      stamps,
      logged,
      RELEASE,
    )!;
    expect(read.merged).toBeNull();
    expect(read.pageCarryPx).toBeCloseTo(37.263, 3);
    expect(wheelReleaseStrays(read)).toBe(false);
  });

  it('passes a merge after the lift, unless the proof reads those steps one by one', () => {
    // Steps 9 and 10 arrived as one 11 px wheel, 16 ms after step 8.
    const after = [
      ...DELTAS.slice(0, 9),
      [11, 0] as [number, number],
      ...DELTAS.slice(11),
    ];
    const stamps = [...SENT.slice(0, 9), SENT[10], SENT[11]];
    const read = wheelReleaseRead(RELEASE_STEPS, SENT, stamps, after, RELEASE)!;
    expect(read.merged).toBeNull();
    expect(wheelReleaseStrays(read)).toBe(false);
    const glide = wheelReleaseRead(RELEASE_STEPS, SENT, stamps, after, {
      ...RELEASE,
      stepwise: {from: 8},
    })!;
    expect(glide.stepwiseMerge).toEqual({steps: [9, 10], gapMs: 32});
    expect(wheelReleaseStrays(glide)).toBe(true);
    // Stamped with the step before, the host reads it as a merge.
    const bunched = [...SENT.slice(0, 9), SENT[8], SENT[11]];
    expect(
      wheelReleaseRead(RELEASE_STEPS, SENT, bunched, after, {
        ...RELEASE,
        stepwise: {from: 8},
      })!.stepwiseMerge,
    ).toBeNull();
  });

  it('names a page that read no speed, which carries nothing, past a bar that needs a carry', () => {
    const stamps = stampsFrom([1, 1, 1, 16, 16, 16, 16, 16, 16, 16, 16]);
    const read = wheelReleaseRead(
      RELEASE_STEPS,
      SENT,
      stamps,
      DELTAS,
      RELEASE,
    )!;
    expect(read.pagePxPerS).toBe(0);
    expect(read.pageCarryPx).toBe(0);
    expect(wheelReleaseStrays(read)).toBe(true);
    // A bar that only caps the carry passes it.
    const capped = wheelReleaseRead(RELEASE_STEPS, SENT, stamps, DELTAS, {
      readStep: 3,
      liftStep: 5,
      carryPx: {max: 57},
    })!;
    expect(wheelReleaseStrays(capped)).toBe(false);
  });

  it('never names a script that lies outside its own bar', () => {
    const read = wheelReleaseRead(RELEASE_STEPS, SENT, SENT, DELTAS, {
      readStep: 3,
      liftStep: 7,
      carryPx: {min: 60},
    })!;
    expect(wheelReleaseStrays(read)).toBe(false);
  });

  it('reads the script from its schedule, so a starved send loop does not move it', () => {
    // The send loop sent step 3 only 5 ms after step 2.
    const sent = [0, 16, 32, 37, 64, 80, 96, 112, 128, 144, 160, 176];
    const read = wheelReleaseRead(RELEASE_STEPS, sent, sent, DELTAS, RELEASE)!;
    expect(read.scriptPxPerS).toBe(750);
    expect(read.scriptCarryPx).toBe(48);
    expect(read.sendGapsMs).toEqual([5, 27, 16, 16, 16]);
  });
});

describe('WheelPacingError with a release read', () => {
  it('names both readings, the carry, the bar and the gaps behind them', () => {
    const stamps = [0, 23, 35, 75, 111, 122, 122, 126, 151, 167, 167, 174];
    const read = wheelReleaseRead(
      RELEASE_STEPS,
      SENT,
      stamps,
      DELTAS,
      RELEASE,
    )!;
    const error = new WheelPacingError(220, [], read);
    expect(error.name).toBe('WheelPacingError');
    expect(error.message).toMatch(
      /the page read a release of 300 px\/s where the script throws 750 px\/s, and carried it 51 ms to the lift where the script carries it 64 ms\. That moves 15\.3 px where the script moves 48\.0 px, past the proof's bar of at least 18 px/,
    );
    expect(error.message).toMatch(
      /steps 2 to 7 stamped 40, 36, 11, 0, 4 ms apart, sent 16, 16, 16, 16, 16 ms apart/,
    );
  });

  it('names a merge inside the steps the release reads', () => {
    const inside = [
      ...DELTAS.slice(0, 5),
      [19, 0] as [number, number],
      ...DELTAS.slice(7),
    ];
    const stamps = stampsFrom([16, 16, 16, 16, 16, 16, 16, 16, 16, 16]);
    const read = wheelReleaseRead(
      RELEASE_STEPS,
      SENT,
      stamps,
      inside,
      RELEASE,
    )!;
    expect(new WheelPacingError(null, [], read).message).toMatch(
      /received sent steps 5 to 6 as one wheel, inside the steps the release reads, 2 to 7\. The gesture host reads such a merge with its own decay/,
    );
  });

  it('names a stepwise merge by the sent steps it carried', () => {
    const after = [
      ...DELTAS.slice(0, 9),
      [11, 0] as [number, number],
      ...DELTAS.slice(11),
    ];
    const stamps = [...SENT.slice(0, 9), SENT[10], SENT[11]];
    const read = wheelReleaseRead(RELEASE_STEPS, SENT, stamps, after, {
      ...RELEASE,
      stepwise: {from: 8},
    })!;
    expect(new WheelPacingError(null, [], read).message).toMatch(
      /received sent steps 9 to 10 as one wheel, stamped 32 ms after the one before, past the gesture host's 1\.5 ms merge window/,
    );
  });
});

describe('wheelReleaseHold', () => {
  const FRAMES = Array.from({length: 24}, (_, k) => 8 + 16 * k);

  /**
   * A delivery on pace, each step handled in 1 ms. `late` adds ms to the gap
   * before a received step. `held` makes the page's listeners on a step run
   * that long, which holds the next step back.
   */
  function delivery(
    late: Record<number, number> = {},
    held: Record<number, number> = {},
  ) {
    const stamps: number[] = [];
    const handledAt: number[] = [];
    SENT.forEach((sent, i) => {
      const gapMs =
        i === 0 ? 0 : Math.max(16, (held[i - 1] ?? 0) + 2) + (late[i] ?? 0);
      stamps.push(i === 0 ? 0 : stamps[i - 1] + gapMs);
      handledAt.push(stamps[i] + (held[i] ?? 1));
    });
    return {
      stamps,
      got: {
        receivedAt: stamps.slice(),
        handledAt,
        frames: FRAMES,
        deltas: DELTAS,
      },
    };
  }

  it('gives the page a stray its own listeners caused by holding a step the release reads', () => {
    // Step 2's listeners ran 60 ms and held step 3 back. The read slows to
    // 194 px/s and carries 12.4 px, short of the 18 px bar. Without that
    // hold the read is on pace.
    const {stamps, got} = delivery({}, {2: 60});
    const read = wheelReleaseRead(
      RELEASE_STEPS,
      SENT,
      stamps,
      DELTAS,
      RELEASE,
    )!;
    expect(wheelReleaseStrays(read)).toBe(true);
    expect(
      wheelReleaseHold('webkit', RELEASE, RELEASE_STEPS, SENT, stamps, got),
    ).toEqual({gapMs: 62, handlingMs: 60});
  });

  it('gives the page a stray from a gap inside the read across which it drew no frame', () => {
    // Step 3 came 116 ms after step 2 with the listeners idle, and the page
    // drew no frame from 24 to 168.
    const {stamps, got} = delivery({3: 100});
    got.frames = [8, 24, ...FRAMES.filter(t => t >= 160)];
    const read = wheelReleaseRead(
      RELEASE_STEPS,
      SENT,
      stamps,
      DELTAS,
      RELEASE,
    )!;
    expect(wheelReleaseStrays(read)).toBe(true);
    expect(
      wheelReleaseHold('webkit', RELEASE, RELEASE_STEPS, SENT, stamps, got),
    ).toEqual({gapMs: 116, handlingMs: 1, frameGapMs: 144});
  });

  it('leaves the runner a stray its own stall caused, though the page also held a later step', () => {
    // The runner stamped step 3 100 ms after step 2: 120 px/s, which carries
    // 7.7 px against the 18 px bar. Step 5's listeners then ran 36 ms, which
    // lengthens the carry to 10.6 px, toward the bar. Read without that hold,
    // the release still strays, so the stray is the runner's.
    const {stamps, got} = delivery({3: 84}, {5: 36});
    expect(stamps.slice(2, 8)).toEqual([32, 132, 148, 164, 202, 218]);
    const read = wheelReleaseRead(
      RELEASE_STEPS,
      SENT,
      stamps,
      DELTAS,
      RELEASE,
    )!;
    expect(read.pageCarryPx).toBeCloseTo(10.32, 2);
    expect(wheelReleaseStrays(read)).toBe(true);
    expect(
      wheelReleaseHold('webkit', RELEASE, RELEASE_STEPS, SENT, stamps, got),
    ).toBeNull();
  });

  it('gives the page a stray its hold caused, beside a runner delay too small to stray alone', () => {
    // The runner stamped step 6 10 ms late; the read alone stays inside the
    // bar. Step 2's listeners held step 3 back 46 ms, which strays.
    const {stamps, got} = delivery({6: 10}, {2: 60});
    const read = wheelReleaseRead(
      RELEASE_STEPS,
      SENT,
      stamps,
      DELTAS,
      RELEASE,
    )!;
    expect(wheelReleaseStrays(read)).toBe(true);
    expect(
      wheelReleaseHold('webkit', RELEASE, RELEASE_STEPS, SENT, stamps, got),
    ).toEqual({gapMs: 62, handlingMs: 60});
  });

  it('leaves the runner a late step the page did not hold: listeners idle, frames running', () => {
    const {stamps, got} = delivery({3: 100});
    expect(
      wheelReleaseHold('webkit', RELEASE, RELEASE_STEPS, SENT, stamps, got),
    ).toBeNull();
  });

  it('gives the page a merged step whose wait its own listeners covered', () => {
    // Steps 5 and 6 arrived as one wheel, stamped like step 4, 66 ms late.
    // Step 4's listeners ran 64 ms of that wait.
    const merged = [
      ...DELTAS.slice(0, 5),
      [19, 0] as [number, number],
      ...DELTAS.slice(7),
    ];
    const stamps = [0, 16, 32, 48, 64, 64, 112, 128, 144, 160, 176];
    const receivedAt = [0, 16, 32, 48, 64, 130, 131, 132, 144, 160, 176];
    const handledAt = [1, 17, 33, 49, 128, 131, 132, 133, 145, 161, 177];
    expect(
      wheelReleaseHold('webkit', RELEASE, RELEASE_STEPS, SENT, stamps, {
        receivedAt,
        handledAt,
        frames: FRAMES,
        deltas: merged,
      }),
    ).toEqual({gapMs: 66, handlingMs: 64});
  });

  it('leaves the runner a logged merge in the read, though the page held the step before it', () => {
    // Logged under load: step 1's listeners ran 30 ms of a 69 ms gap before
    // step 2. Steps 3 and 4 then arrived as one wheel, which the read names.
    // Read without the hold, the merge still strays, and its own wait was
    // 1 ms.
    const deltas = [12, 12, 12, 23, 10, 9, 8, 7, 6, 5, 4].map(
      (dx): [number, number] => [dx, 0],
    );
    expect(
      wheelReleaseHold(
        'webkit',
        RELEASE,
        RELEASE_STEPS,
        [0, 17, 36, 53, 77, 85, 100, 120, 141, 153, 166, 182],
        [0, 0, 69, 69, 102, 129, 129, 162, 162, 181, 182],
        {
          receivedAt: [7, 51, 69, 70, 103, 130, 133, 163, 165, 181, 182],
          handledAt: [36, 52, 70, 70, 103, 130, 134, 163, 166, 181, 183],
          frames: [-17, -1, 44, 51, 68, 92, 117, 125, 140, 156, 175, 196],
          deltas,
        },
      ),
    ).toBeNull();
  });

  it('leaves the runner a logged gap that only a frame of slack could pin on the page', () => {
    // Logged under load: a 31 ms gap where the script spaces 10 ms, with
    // 1 ms of listener time. One frame of slack is the dispatch's.
    const deltas = [12, 12, 12, 12, 11, 10, 24, 11, 4].map(
      (dx): [number, number] => [dx, 0],
    );
    expect(
      wheelReleaseHold(
        'webkit',
        RELEASE,
        RELEASE_STEPS,
        [0, 25, 33, 55, 65, 101, 103, 136, 147, 158, 165, 176],
        [0, 36, 81, 81, 112, 137, 138, 139, 159],
        {
          receivedAt: [13, 49, 96, 99, 112, 138, 143, 147, 160],
          handledAt: [35, 50, 97, 99, 113, 138, 143, 148, 160],
          frames: [-15, 4, 44, 49, 60, 78, 97, 103, 125, 138, 158, 173],
          deltas,
        },
      ),
    ).toBeNull();
  });

  it('judges only the steps the release reads, and only in WebKit', () => {
    // Step 9's listeners held step 10, after the lift.
    const {stamps, got} = delivery({}, {9: 50});
    expect(
      wheelReleaseHold('webkit', RELEASE, RELEASE_STEPS, SENT, stamps, got),
    ).toBeNull();
    // Chromium stamps a step at dispatch: the page cannot hold its stamps.
    const before = delivery({}, {2: 60});
    expect(
      wheelReleaseHold(
        'chromium',
        RELEASE,
        RELEASE_STEPS,
        SENT,
        before.stamps,
        before.got,
      ),
    ).toBeNull();
  });
});

describe('WheelPageStallError over a release', () => {
  it('names the page, its hold and the steps the release reads, and is not a pacing error', () => {
    const read = wheelReleaseRead(RELEASE_STEPS, SENT, SENT, DELTAS, RELEASE)!;
    const error = new WheelPageStallError(
      220,
      {gapMs: 62, handlingMs: 60},
      read,
    );
    expect(error.name).toBe('WheelPageStallError');
    expect(error.message).toMatch(
      /the page's own wheel listeners took 60 ms of page wall time inside the steps the release reads, 2 to 7, and held the next step 62 ms: the page, not the runner, changed the release the gesture host read/,
    );
    expect(error).not.toBeInstanceOf(WheelPacingError);
    expect(
      new WheelPageStallError(
        220,
        {gapMs: 116, handlingMs: 1, frameGapMs: 124},
        read,
      ).message,
    ).toMatch(
      /the page drew no frame for 124 ms inside the steps the release reads/,
    );
  });
});

describe('WheelPageStallError', () => {
  it("names the page's handling, the gap and the bound, and is not a pacing error", () => {
    const error = new WheelPageStallError(100, {gapMs: 152, handlingMs: 150});
    expect(error.name).toBe('WheelPageStallError');
    expect(error.message).toMatch(
      /took 150 ms of page wall time to handle a step/,
    );
    expect(error.message).toMatch(/152 ms later, at or over its 100 ms/);
    expect(error.message).toMatch(
      /the page split the run\. On a starved runner that time includes the page's wait for a CPU: judge a page stall from a run with CI's CPU limits/,
    );
    expect(error.message).not.toMatch(/not the runner/);
    expect(error).not.toBeInstanceOf(WheelPacingError);
  });
});
