// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {MARGIN_S, RATIO, drifted} from './node-time-drift.mjs';

const CHANGES = 'packages/cli/test/packed-gather-cache.changes.test.mjs';

describe('the recorded-time check for the test files a change touches', () => {
  it('fails a changed file that runs far past its record, as #11427 left packed-gather-cache.changes', () => {
    expect(drifted({[CHANGES]: 337.9}, {[CHANGES]: 207.8}, [CHANGES])).toEqual([
      {file: CHANGES, recorded: 207.8, measured: 337.9},
    ]);
  });

  it('passes a file the change does not touch, however slow: a slow runner fails no one', () => {
    expect(
      drifted({[CHANGES]: 900}, {[CHANGES]: 207.8}, ['README.md']),
    ).toEqual([]);
  });

  it(`needs both more than ${RATIO} times and more than ${MARGIN_S} s over`, () => {
    const file = 'a.test.mjs';
    // 1.6 times, but only 30 s over: a short file's noise.
    expect(drifted({[file]: 80}, {[file]: 50}, [file])).toEqual([]);
    // 90 s over, but only 1.3 times: within a loaded runner's spread.
    expect(drifted({[file]: 390}, {[file]: 300}, [file])).toEqual([]);
  });

  it('skips a changed file with no recorded time (the legs count it as the median)', () => {
    expect(drifted({'new.test.mjs': 400}, {}, ['new.test.mjs'])).toEqual([]);
  });
});
