// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {
  canCut,
  lineSelects,
  listedTests,
  partitionTests,
  recordDurations,
  recordTestDurations,
  testKey,
  testListLines,
  unitsWall,
} from './a11y-contract-shard.mjs';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

/** `count` tests of one file, titled t0…, under an optional describe. */
const testsOf = (file, count, describe) =>
  Array.from({length: count}, (_, index) => ({
    file,
    titles: describe ? [describe, `t${index}`] : [`t${index}`],
    line: index + 1,
    column: 1,
  }));

/** Every test selected by exactly one leg's lines, as Playwright reads them. */
function selectedOnce(tests, legs) {
  const lines = legs.map(testListLines);
  return tests.every(
    test =>
      lines.filter(leg => leg.some(line => lineSelects(line, test))).length ===
      1,
  );
}

describe('a11y contract shards', () => {
  const tests = [
    ...testsOf('packages/long.spec.ts', 40, 'ltr'),
    ...testsOf('packages/b.spec.ts', 10),
    ...testsOf('packages/c.spec.ts', 10),
    ...testsOf('packages/new.spec.ts', 3),
    ...testsOf('internal/f.spec.ts', 2),
  ];
  const recorded = {
    // The long file is twelve minutes of work, more than any leg's share.
    seconds: {'packages/long.spec.ts': 720, 'packages/b.spec.ts': 60},
    tests: Object.fromEntries(
      testsOf('packages/c.spec.ts', 10).map(test => [testKey(test), 3]),
    ),
  };

  it('selects every test in exactly one leg, including unrecorded tests', () => {
    for (const count of [1, 2, 3, 6, 8]) {
      const legs = partitionTests(tests, count, recorded);
      expect(legs).toHaveLength(count);
      expect(selectedOnce(tests, legs), `${count} legs`).toBe(true);
      expect(
        legs.flat().reduce((sum, unit) => sum + unit.tests.length, 0),
      ).toBe(tests.length);
    }
  });

  it('cuts a file longer than a leg’s share into consecutive parts in different legs', () => {
    const legs = partitionTests(tests, 6, recorded);
    const parts = legs.flatMap((leg, index) =>
      leg
        .filter(unit => unit.file === 'packages/long.spec.ts')
        .map(unit => ({...unit, leg: index})),
    );
    expect(parts.length).toBeGreaterThan(1);
    expect(new Set(parts.map(part => part.leg)).size).toBe(parts.length);
    // Consecutive, in declaration order, and together the whole file.
    const ordered = parts
      .sort((a, b) => a.part - b.part)
      .flatMap(part => part.tests.map(test => test.line));
    expect(ordered).toEqual(Array.from({length: 40}, (_, i) => i + 1));
    // No leg waits on the whole long file.
    expect(Math.max(...legs.map(leg => unitsWall(leg)))).toBeLessThan(720);
  });

  it('names a cut file’s tests one per line and a whole file by its path', () => {
    const lines = partitionTests(tests, 6, recorded).flatMap(testListLines);
    expect(lines).toContain('[chromium] › packages/new.spec.ts');
    expect(lines).toContain('[chromium] › packages/long.spec.ts › ltr › t0');
    expect(lines).not.toContain('[chromium] › packages/long.spec.ts');
  });

  it('never cuts a file it cannot name exactly or that runs serially', () => {
    const odd = testsOf('packages/long.spec.ts', 40, 'a › b');
    expect(canCut(odd)).toBe(false);
    expect(canCut(testsOf('x', 3, ' padded'))).toBe(false);
    // Playwright's test-list reader would split a title with a line break.
    expect(canCut(testsOf('x', 3, 'two\nlines'))).toBe(false);
    expect(canCut(testsOf('x', 3, 'two\r\nlines'))).toBe(false);
    // A test titled like a describe would select the describe's tests too.
    expect(
      canCut([
        {file: 'x', titles: ['group']},
        {file: 'x', titles: ['group', 'inner']},
      ]),
    ).toBe(false);
    expect(
      canCut(testsOf('x', 3), "test.describe.configure({mode: 'serial'})"),
    ).toBe(false);
    expect(canCut(testsOf('x', 3), 'test.describe.serial(')).toBe(false);
    expect(canCut(testsOf('x', 3, 'ltr'))).toBe(true);
    const legs = partitionTests(
      [...odd, ...testsOf('packages/b.spec.ts', 10)],
      6,
      recorded,
    );
    expect(
      legs.flat().filter(unit => unit.file === 'packages/long.spec.ts'),
    ).toHaveLength(1);
  });

  it('never cuts a file whose title paths repeat', () => {
    const twins = [
      ...testsOf('packages/long.spec.ts', 20, 'ltr'),
      ...testsOf('packages/long.spec.ts', 20, 'ltr').map(test => ({
        ...test,
        line: test.line + 100,
      })),
    ];
    expect(canCut(twins)).toBe(false);
    const legs = partitionTests(twins, 6, recorded);
    expect(selectedOnce(twins, legs)).toBe(true);
    expect(legs.flat()).toHaveLength(1);
  });

  it('reads Playwright test-list lines as Playwright does', () => {
    const test = {file: 'p/a.spec.ts', titles: ['ltr', 'opens']};
    expect(lineSelects('[chromium] › p/a.spec.ts', test)).toBe(true);
    expect(lineSelects('[chromium] › p/a.spec.ts › ltr', test)).toBe(true);
    expect(lineSelects('[chromium] › p/a.spec.ts › ltr › opens', test)).toBe(
      true,
    );
    expect(lineSelects('[chromium] › p/a.spec.ts › rtl', test)).toBe(false);
    expect(lineSelects('[webkit] › p/a.spec.ts', test)).toBe(false);
    expect(lineSelects('[chromium] › p/b.spec.ts', test)).toBe(false);
  });

  it('drops an anonymous describe from the title path, as Playwright does', () => {
    const [test] = listedTests({
      suites: [
        {
          title: 'x.spec.ts',
          file: 'x.spec.ts',
          suites: [
            {
              title: '',
              file: 'x.spec.ts',
              suites: [
                {
                  title: 'ltr',
                  file: 'x.spec.ts',
                  specs: [
                    {title: 'opens', file: 'x.spec.ts', line: 3, column: 5},
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(test.titles).toEqual(['ltr', 'opens']);
    // So the line a cut file's part lists selects exactly that test.
    const leg = [
      {file: 'x.spec.ts', part: 1, parts: 2, tests: [test], seconds: 1},
    ];
    expect(testListLines(leg)).toEqual([
      '[chromium] › x.spec.ts › ltr › opens',
    ]);
  });

  it('lists every test of a Playwright JSON listing in declaration order', () => {
    expect(
      listedTests({
        suites: [
          {
            title: 'x.spec.ts',
            file: 'x.spec.ts',
            specs: [{title: 'late', file: 'x.spec.ts', line: 30, column: 1}],
            suites: [
              {
                title: 'group',
                file: 'x.spec.ts',
                specs: [
                  {title: 'early', file: 'x.spec.ts', line: 5, column: 3},
                ],
              },
            ],
          },
          {
            title: 'a.spec.ts',
            file: 'a.spec.ts',
            specs: [{title: 'one', file: 'a.spec.ts', line: 1, column: 1}],
          },
        ],
      }).map(test => [test.file, ...test.titles].join(' › ')),
    ).toEqual([
      'a.spec.ts › one',
      'x.spec.ts › group › early',
      'x.spec.ts › late',
    ]);
  });

  it('balances the recorded suite far below its longest file', () => {
    const recordedSuite = JSON.parse(
      fs.readFileSync(
        path.join(ROOT, '.github/a11y-contract-durations.json'),
        'utf8',
      ),
    );
    const suite = Object.keys(recordedSuite.tests).map((key, index) => {
      const [file, ...titles] = key.split(' › ');
      return {file, titles, line: index, column: 0};
    });
    const longestFile = Math.max(...Object.values(recordedSuite.seconds));
    const legs = partitionTests(suite, 6, recordedSuite);
    expect(selectedOnce(suite, legs)).toBe(true);
    expect(Math.max(...legs.map(leg => unitsWall(leg)))).toBeLessThan(
      longestFile,
    );
  });

  it('simulates path-order workers', () => {
    const unit = (file, seconds) => ({file, part: 1, seconds});
    expect(unitsWall([unit('b', 1), unit('a', 5), unit('c', 1)], 2)).toBe(5);
  });

  it('records seconds per file and per test from list-reporter lines', () => {
    const log = [
      '  ✓  1 [chromium] › packages/a.spec.ts:10:1 › ltr › one (1.5s)',
      '  ✓  2 [chromium] › packages/a.spec.ts:20:1 › two (500ms)',
      '  ✘  3 [chromium] › packages/b.spec.ts:5:1 › three (1.2m)',
      'unrelated line',
    ].join('\n');
    expect(recordDurations(log)).toEqual({
      'packages/a.spec.ts': 2,
      'packages/b.spec.ts': 72,
    });
    expect(recordTestDurations(log)).toEqual({
      'packages/a.spec.ts › ltr › one': 1.5,
      'packages/a.spec.ts › two': 0.5,
      'packages/b.spec.ts › three': 72,
    });
  });
});
