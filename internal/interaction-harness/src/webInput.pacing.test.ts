// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file webInput.pacing.test.ts
 * @input webInput.ts's wheel pacing error and re-take
 * @output Unit cases: a wheel burst's steps arrive when the page received
 *   them in WebKit and at their stamps in Chromium; its gaps past its bound
 *   are the page's when its own handling of the step before caused them, and
 *   the dispatch's otherwise; each error names its gaps; and a proof is
 *   re-taken once, only on a dispatch stall, with the re-take listed.
 * @position Node unit tests beside the harness's browser self-tests.
 *
 * SYNC: When modified, update webInput.ts (wheelArrivals, wheelGapCauses,
 *   WheelPacingError, WheelPageStallError, retakeOnWheelPacing).
 */

import {describe, expect, it} from 'vitest';
import {
  retakeOnWheelPacing,
  wheelArrivals,
  wheelGapCauses,
  WheelPacingError,
  WheelPageStallError,
} from './webInput';

describe('WheelPacingError', () => {
  it('names the longest gap, the bound and every gap', () => {
    const error = new WheelPacingError(100, [16, 16, 141, 0, 16]);
    expect(error.name).toBe('WheelPacingError');
    expect(error.message).toMatch(/a gap of 141 ms, over its 100 ms/);
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

  it('counts a step whose handling was never seen as the dispatch\u2019s', () => {
    expect(wheelGapCauses('webkit', [0, 150], [Number.NaN, 151], 100)).toEqual({
      pageStalls: [],
      dispatchStalls: [150],
    });
  });
});

describe('WheelPageStallError', () => {
  it("names the page's handling, the gap and the bound, and is not a pacing error", () => {
    const error = new WheelPageStallError(100, {gapMs: 152, handlingMs: 150});
    expect(error.name).toBe('WheelPageStallError');
    expect(error.message).toMatch(/took 150 ms to handle a step/);
    expect(error.message).toMatch(/152 ms later, over its 100 ms/);
    expect(error.message).toMatch(/the page split the run, not the runner/);
    expect(error).not.toBeInstanceOf(WheelPacingError);
  });
});

describe('retakeOnWheelPacing', () => {
  const offPace = () => new WheelPacingError(100, [16, 120]);

  it('stays red when both attempts are off pace, with one re-take listed', async () => {
    const testInfo = {
      annotations: [] as {type: string; description?: string}[],
    };
    let attempts = 0;
    await expect(
      retakeOnWheelPacing(testInfo, async () => {
        attempts += 1;
        throw offPace();
      }),
    ).rejects.toBeInstanceOf(WheelPacingError);
    expect(attempts).toBe(2);
    expect(testInfo.annotations.map(a => a.type)).toEqual(['wheel-retake']);
  });

  it('never re-takes a product failure after input that kept its pace', async () => {
    const testInfo = {
      annotations: [] as {type: string; description?: string}[],
    };
    let attempts = 0;
    await expect(
      retakeOnWheelPacing(testInfo, async () => {
        attempts += 1;
        throw new Error('the gallery did not page');
      }),
    ).rejects.toThrow('the gallery did not page');
    expect(attempts).toBe(1);
    expect(testInfo.annotations).toEqual([]);
  });

  it('never re-takes a stall the page caused', async () => {
    const testInfo = {
      annotations: [] as {type: string; description?: string}[],
    };
    let attempts = 0;
    await expect(
      retakeOnWheelPacing(testInfo, async () => {
        attempts += 1;
        throw new WheelPageStallError(100, {gapMs: 152, handlingMs: 150});
      }),
    ).rejects.toBeInstanceOf(WheelPageStallError);
    expect(attempts).toBe(1);
    expect(testInfo.annotations).toEqual([]);
  });

  it('passes on a good second attempt after one off pace, and lists the re-take', async () => {
    const testInfo = {
      annotations: [] as {type: string; description?: string}[],
    };
    const seen: number[] = [];
    const result = await retakeOnWheelPacing(testInfo, async n => {
      seen.push(n);
      if (n === 1) {
        throw offPace();
      }
      return 'paged';
    });
    expect(result).toBe('paged');
    expect(seen).toEqual([1, 2]);
    expect(testInfo.annotations).toEqual([
      {type: 'wheel-retake', description: offPace().message},
    ]);
  });
});
