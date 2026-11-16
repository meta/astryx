// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it, vi} from 'vitest';
import {
  MARGIN_S,
  MIN_PEERS,
  RATIO,
  drifted,
  legFactor,
  NEW_FILE_S,
  unrecorded,
  parseNameStatus,
  notices,
  main,
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
  it('names a changed file that runs far past its record while its leg runs at its record', () => {
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

  it('names a changed file 2× slow when the rest of its leg runs at its record', () => {
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

  it('skips a changed file with no recorded time (the legs book it at the ninetieth percentile)', () => {
    expect(drifted({'new.test.mjs': 400}, {}, ['new.test.mjs'])).toEqual([]);
  });

  describe('a changed test file with no recorded time', () => {
    const NEW = 'packages/cli/api/theme-edit/theme-how.test.mjs';

    it('fails when it ran more than NEW_FILE_S in an unslowed leg, naming the one entry to add', () => {
      const {recorded, measured} = leg(8, 40, 1);
      measured[NEW] = 120;
      // The drift check alone passes it: it has no record to fall behind.
      expect(drifted(measured, recorded, [NEW])).toEqual([]);
      expect(unrecorded(measured, recorded, [NEW])).toEqual([
        {file: NEW, measured: 120, factor: 1, suggested: 120},
      ]);
    });

    it('takes out the leg slowdown: 120 s in a leg running 2x passes, 150 s fails at 75 s', () => {
      const {recorded, measured} = leg(8, 40, 2);
      measured[NEW] = 2 * NEW_FILE_S;
      expect(unrecorded(measured, recorded, [NEW])).toEqual([]);
      measured[NEW] = 150;
      expect(unrecorded(measured, recorded, [NEW])).toEqual([
        {file: NEW, measured: 150, factor: 2, suggested: 75},
      ]);
    });

    it('passes a short new file, and never reports a file the change does not touch', () => {
      const {recorded, measured} = leg(8, 40, 1);
      measured[NEW] = 40;
      measured['packages/cli/other-unrecorded.test.mjs'] = 200;
      expect(unrecorded(measured, recorded, [NEW])).toEqual([]);
    });

    it('reports a renamed file by its new path, and names the old entry to move', () => {
      const {recorded, measured} = leg(8, 40, 1);
      const OLD = 'packages/cli/api/theme-edit/theme-how-old.test.mjs';
      recorded[OLD] = 100;
      measured[NEW] = 120;
      // The leg split looks the record up by NEW's path, so NEW is unrecorded.
      expect(unrecorded(measured, recorded, [NEW], [[OLD, NEW]])).toEqual([
        {
          file: NEW,
          measured: 120,
          factor: 1,
          suggested: 120,
          from: OLD,
          fromRecorded: 100,
        },
      ]);
    });

    it('reports a rename from a path with no record as an entry to add', () => {
      const {recorded, measured} = leg(8, 40, 1);
      measured[NEW] = 120;
      expect(
        unrecorded(
          measured,
          recorded,
          [NEW],
          [['packages/cli/never-recorded.test.mjs', NEW]],
        ),
      ).toEqual([{file: NEW, measured: 120, factor: 1, suggested: 120}]);
    });

    it('passes a short renamed file whatever its old record', () => {
      const {recorded, measured} = leg(8, 40, 1);
      const OLD = 'packages/cli/api/theme-edit/theme-how-old.test.mjs';
      recorded[OLD] = 30;
      measured[NEW] = 30;
      expect(unrecorded(measured, recorded, [NEW], [[OLD, NEW]])).toEqual([]);
    });

    it('reads changed paths and renames from git diff --name-status -M', () => {
      expect(
        parseNameStatus(
          `M\tpackages/a.test.mjs\nA\t${NEW}\nR087\tpackages/old.test.mjs\tpackages/new.test.mjs\nD\tpackages/gone.test.mjs\n`,
        ),
      ).toEqual({
        changed: [
          'packages/a.test.mjs',
          NEW,
          'packages/new.test.mjs',
          'packages/gone.test.mjs',
        ],
        renames: [['packages/old.test.mjs', 'packages/new.test.mjs']],
      });
    });
  });
});

describe('judging every file, for a scheduled run', () => {
  const recorded = {
    'a.test.mjs': 10,
    'b.test.mjs': 10,
    'c.test.mjs': 10,
    'd.test.mjs': 10,
    'e.test.mjs': 10,
    'f.test.mjs': 10,
  };

  it('reads the slowdown from every file, so a uniformly slow run names none', () => {
    const measured = Object.fromEntries(
      Object.keys(recorded).map(file => [file, 25]),
    );
    expect(drifted(measured, recorded, [], {all: true, margin: 10})).toEqual(
      [],
    );
  });

  it('names a file past its share of that slowdown, with the margin given', () => {
    const measured = {
      ...Object.fromEntries(Object.keys(recorded).map(file => [file, 10])),
      'a.test.mjs': 40,
    };
    expect(
      drifted(measured, recorded, [], {all: true, margin: 10}).map(
        row => row.file,
      ),
    ).toEqual(['a.test.mjs']);
    // Without `all`, only the changed files are judged.
    expect(drifted(measured, recorded, [])).toEqual([]);
  });
});

describe('notice mode: the check reports and never fails the leg', () => {
  const {recorded, measured} = leg(8, 40, 1);
  recorded[CHANGES] = 207.8;
  measured[CHANGES] = 337.9;
  measured[RECORDS] = 120;

  it('reports a drifted and an unrecorded changed file as notices, never errors', () => {
    const lines = notices(measured, recorded, [CHANGES, RECORDS]);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(
      /^::notice file=.*title=Recorded Node test time is stale::/,
    );
    expect(lines[0]).toContain(`"${CHANGES}": 337.9`);
    expect(lines[1]).toMatch(
      /^::notice file=.*title=Node test file has no recorded time::/,
    );
    expect(lines[1]).toContain(`"${RECORDS}": 120`);
    expect(lines.join('\n')).not.toContain('::error');
  });

  it('exits 0 for a leg with a drifted and an unrecorded changed file', () => {
    // A path the repository's record has no entry for.
    const NEW = 'packages/cli/test/not-yet-recorded.test.mjs';
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-time-drift-'));
    const times = path.join(dir, 'times.json');
    fs.writeFileSync(times, JSON.stringify({[NEW]: 600}));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      expect(
        main(['--times', times, '--changed', 'base'], {
          diff: () => `A\t${NEW}\n`,
        }),
      ).toBe(0);
      expect(log.mock.calls.flat().join('\n')).toContain(
        `::notice file=${NEW},title=Node test file has no recorded time::`,
      );
    } finally {
      log.mockRestore();
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  it('exits 2 only for missing arguments', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(main(['--times', 'x.json'])).toBe(2);
    error.mockRestore();
  });
});
