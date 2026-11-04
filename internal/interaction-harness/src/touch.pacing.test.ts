// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file touch.pacing.test.ts
 * @input touch.ts's pacing rule for an engine that stamps touches with their
 *   dispatch time (leaveAt)
 * @output Unit cases for leaveAt. A step leaves at its scripted time while the
 *   engine answers within 2 ms. After a late answer, it keeps the script's
 *   gap, less 2 ms, from that answer. Over a stall in the page, no gap reads
 *   more than 2 ms shorter than the script's.
 * @position Node unit tests beside the harness's browser self-tests.
 *
 * SYNC: When modified, update touch.ts (leaveAt, playSteps).
 */

import {describe, expect, it} from 'vitest';
import {leaveAt} from './touch';

describe('leaveAt', () => {
  it('sends the first step, and every step the engine answered in time, at its scripted time', () => {
    expect(leaveAt(0, null, 0)).toBe(0);
    // The step before was answered at 18 ms, the next is scripted for 33.3.
    expect(leaveAt(33.3, 18, 16.7)).toBe(33.3);
  });

  it('keeps the script gap, less 2 ms, after the engine answered the step before late', () => {
    // The engine held the step scripted for 16.7 ms until 96.7 ms.
    expect(leaveAt(33.3, 96.7, 16.7)).toBeCloseTo(111.4, 6);
  });

  it('over a stall in the page, never lets two stamps read more than 2 ms closer than the script', () => {
    // A 60 Hz drag. The page held one event for 80 ms. The engine stamps an
    // event between its send and its answer. The closest two stamps can come
    // is the earlier one at its answer and the later one at its send.
    const gap = 1000 / 60;
    const scripted = Array.from({length: 12}, (_, i) => i * gap);
    const handling = scripted.map((_, i) => (i === 4 ? 80 : 0));
    const left: number[] = [];
    const answered: number[] = [];
    for (const [i, at] of scripted.entries()) {
      left.push(leaveAt(at, i > 0 ? answered[i - 1] : null, i > 0 ? gap : 0));
      answered.push(left[i] + handling[i]);
    }
    const closest = left.slice(1).map((sent, i) => sent - answered[i]);
    expect(Math.min(...closest)).toBeCloseTo(gap - 2, 9);
  });
});
