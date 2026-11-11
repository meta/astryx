// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file webInput.pacing.test.ts
 * @input webInput.ts's wheel pacing errors
 * @output Unit cases. A wheel burst's steps arrive when the page received
 *   them in WebKit, and at their stamps in Chromium. A gap past its bound is
 *   the page's when two things hold. The page's handling of the step before
 *   caused it, and it is wider than the harness's send spacing. Otherwise the
 *   gap is the dispatch's. Each error names its gaps.
 * @position Node unit tests beside the harness's browser self-tests.
 *
 * SYNC: When modified, update webInput.ts (wheelArrivals, wheelSendGaps, wheelGapCauses,
 *   WheelPacingError, WheelPageStallError).
 */

import {describe, expect, it} from 'vitest';
import {
  wheelArrivals,
  wheelGapCauses,
  wheelSendGaps,
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

describe('wheelArrivals', () => {
  it('takes a WebKit step at when the page received it, and a Chromium step at its stamp', () => {
    // WebKit held three steps while the listener blocked for 150 ms and
    // coalesced them into one, stamped like the step before it.
    expect(wheelArrivals('webkit', [133, 133], [134, 284])).toEqual([134, 284]);
    expect(wheelArrivals('chromium', [11, 27, 59], [34, 185, 336])).toEqual([
      11, 27, 59,
    ]);
  });

  it('gives the page the gap a WebKit step coalesced behind its listener waited, though its stamp did not move', () => {
    const stamps = [133, 133];
    const receivedAt = [134, 284];
    const handledAt = [284, 434];
    expect(
      wheelGapCauses(
        'webkit',
        wheelArrivals('webkit', stamps, receivedAt),
        handledAt,
        100,
      ),
    ).toEqual({
      pageStalls: [{gapMs: 150, handlingMs: 150}],
      dispatchStalls: [],
    });
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
