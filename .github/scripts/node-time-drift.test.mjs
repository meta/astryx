// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {
  MARGIN_S,
  MIN_PEERS,
  RATIO,
  drifted,
  legFactor,
} from './node-time-drift.mjs';

const CHANGES = 'packages/cli/test/packed-gather-cache.changes.test.mjs';
const RECORDS = 'packages/cli/test/packed-gather-cache.records.test.mjs';

/** A leg of `count` untouched files, each recorded at `seconds`, run `scale` times slower. */
function leg(count, seconds, scale) {
  const recorded = {};
  const measured = {};
  for (let i = 0; i < count; i++) {
    recorded[`peer-${i}.test.mjs`] = seconds;
    measured[`peer-${i}.test.mjs`] = seconds * scale;
  }
  return {recorded, measured};
}

describe('the recorded-time check for the test files a change touches', () => {
  it('fails a changed file that runs far past its record while its leg runs at its record', () => {
    const {recorded, measured} = leg(8, 40, 1);
    recorded[CHANGES] = 207.8;
    measured[CHANGES] = 337.9;
    expect(drifted(measured, recorded, [CHANGES])).toEqual([
      {
        file: CHANGES,
        recorded: 207.8,
        measured: 337.9,
        factor: 1,
        suggested: 337.9,
      },
    ]);
  });

  it('passes a changed file 2× slow when every file in its leg is 2× slow: a loaded runner', () => {
    const {recorded, measured} = leg(8, 40, 2);
    recorded[RECORDS] = 107.3;
    measured[RECORDS] = 208.4;
    expect(drifted(measured, recorded, [RECORDS])).toEqual([]);
  });

  it('fails a changed file 2× slow when the rest of its leg runs at its record', () => {
    const {recorded, measured} = leg(8, 40, 1);
    recorded[RECORDS] = 107.3;
    measured[RECORDS] = 228.4;
    expect(drifted(measured, recorded, [RECORDS])).toMatchObject([
      {file: RECORDS, factor: 1, suggested: 228.4},
    ]);
  });

  it("suggests the file's time with the leg's slowdown taken out", () => {
    const {recorded, measured} = leg(8, 40, 1.5);
    recorded[CHANGES] = 100;
    measured[CHANGES] = 400;
    expect(drifted(measured, recorded, [CHANGES])).toMatchObject([
      {file: CHANGES, factor: 1.5, suggested: 266.7},
    ]);
  });

  it('passes a file the change does not touch, however slow', () => {
    const {recorded, measured} = leg(8, 40, 1);
    recorded[CHANGES] = 207.8;
    measured[CHANGES] = 900;
    expect(drifted(measured, recorded, ['README.md'])).toEqual([]);
  });

  it(`needs both more than ${RATIO} times and more than ${MARGIN_S} s over`, () => {
    const file = 'a.test.mjs';
    expect(drifted({[file]: 80}, {[file]: 50}, [file])).toEqual([]);
    expect(drifted({[file]: 390}, {[file]: 300}, [file])).toEqual([]);
  });

  it(`states that a leg with fewer than ${MIN_PEERS} unchanged recorded files has no baseline, and uses 1`, () => {
    const {recorded, measured} = leg(MIN_PEERS - 1, 40, 3);
    expect(legFactor(measured, recorded, new Set())).toEqual({
      factor: 1,
      peers: MIN_PEERS - 1,
      baseline: false,
      median: undefined,
    });
    const more = leg(MIN_PEERS, 40, 3);
    expect(legFactor(more.measured, more.recorded, new Set())).toEqual({
      factor: 3,
      peers: MIN_PEERS,
      baseline: true,
      median: 3,
    });
  });

  it('has no baseline when every file in the leg is changed', () => {
    const {recorded, measured} = leg(8, 40, 3);
    expect(
      legFactor(measured, recorded, new Set(Object.keys(measured))),
    ).toMatchObject({
      factor: 1,
      baseline: false,
    });
  });

  it('never lets a fast runner tighten the bar below 1.5 times the record', () => {
    const {recorded, measured} = leg(8, 40, 0.5);
    expect(legFactor(measured, recorded, new Set())).toMatchObject({factor: 1});
    // 1.4 times its record on a leg running at half its record still passes.
    recorded[CHANGES] = 200;
    measured[CHANGES] = 280;
    expect(drifted(measured, recorded, [CHANGES])).toEqual([]);
  });

  it('reads a leg whose untouched files run at their record as unslowed, on one clock', () => {
    // Real untouched files are mostly short; on the record's clock (no
    // import) they run at their record. The changed file's drift then fails.
    const {recorded, measured} = leg(40, 0.5, 1);
    recorded[CHANGES] = 207.8;
    measured[CHANGES] = 337.9;
    expect(legFactor(measured, recorded, new Set([CHANGES]))).toMatchObject({
      factor: 1,
      baseline: true,
    });
    expect(drifted(measured, recorded, [CHANGES])).toHaveLength(1);
  });

  it('skips a changed file with no recorded time (the legs count it as the median)', () => {
    expect(drifted({'new.test.mjs': 400}, {}, ['new.test.mjs'])).toEqual([]);
  });
});
