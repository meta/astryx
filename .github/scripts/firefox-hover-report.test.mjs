// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file firefox-hover-report.test.mjs
 * @input .github/scripts/firefox-hover-report.mjs, its known failures and the
 *   Firefox spec list
 * @output Proof that the Firefox report counts known and new failures apart,
 *   names known failures that now pass, never passes a run that left no
 *   results, and that each known failure names a listed spec and a cause
 *   label
 * @position Node coverage for the Firefox hover runs' report
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

import {buildReport} from './firefox-hover-report.mjs';
import {FIREFOX_HOVER_SPECS} from './lib/a11y-spec-files.mjs';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const known = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, '.github/firefox-known-failures.json'),
    'utf8',
  ),
).failures;

const SPEC =
  'packages/core/src/Tooltip/__tests__/TooltipHoverBridge.a11y.chromium.spec.ts';
/** A Playwright JSON report of one spec file's tests. */
function reportOf(tests) {
  return {
    suites: [
      {
        title: SPEC,
        file: SPEC,
        specs: tests.map(([title, status], index) => ({
          title,
          file: SPEC,
          line: 10 + index,
          tests: [
            {
              status,
              annotations: [],
              results: [
                {
                  status: status === 'expected' ? 'passed' : 'failed',
                  error:
                    status === 'expected'
                      ? undefined
                      : {message: `Error: ${title} broke\n  at line`},
                },
              ],
            },
          ],
        })),
      },
    ],
    errors: [],
  };
}
const entry = (title, tracking = 'firefox-hover-placement-anchor') => ({
  file: SPEC,
  title,
  tracking,
});

describe('the Firefox report', () => {
  it('counts known and new failures apart, and leads with the count', () => {
    const result = buildReport(
      reportOf([
        ['opens', 'expected'],
        ['known break', 'unexpected'],
        ['new break', 'unexpected'],
      ]),
      [entry('known break')],
    );
    expect(result.summary).toBe('Firefox: 1 known failure, 1 new');
    expect(result.markdown.split('\n')[0]).toBe(result.summary);
    expect(result.added.map(test => test.title)).toEqual(['new break']);
    expect(result.known.map(test => [test.title, test.tracking])).toEqual([
      ['known break', 'firefox-hover-placement-anchor'],
    ]);
    // A new failure is listed before the known ones, with a command that runs
    // it again in Firefox.
    const markdown = result.markdown;
    expect(markdown.indexOf('## New failures')).toBeLessThan(
      markdown.indexOf('## Known failures'),
    );
    expect(markdown).toContain(
      `pnpm exec playwright test ${SPEC}:12 --config playwright.config.ts --project firefox`,
    );
  });

  it('names a known failure that now passes', () => {
    const result = buildReport(
      reportOf([
        ['known break', 'expected'],
        ['other', 'expected'],
      ]),
      [entry('known break')],
    );
    expect(result.summary).toBe(
      'Firefox: 0 known failures, 0 new, 1 known failure now passes',
    );
    expect(result.fixed.map(each => each.title)).toEqual(['known break']);
  });

  it('counts a test a serial file skipped after a failure as not run, and one skipped on purpose as run', () => {
    const report = reportOf([
      ['known break', 'unexpected'],
      ['after the break', 'skipped'],
      ['skipped on purpose', 'skipped'],
    ]);
    const tests = report.suites[0].specs;
    tests[1].tests[0].results = [{status: 'skipped'}];
    tests[2].tests[0].results = [{status: 'skipped'}];
    tests[2].tests[0].annotations = [
      {type: 'skip', description: 'Chromium-only'},
    ];
    const result = buildReport(report, [entry('known break')]);
    expect(result.summary).toBe('Firefox: 1 known failure, 0 new, 1 not run');
  });

  it('counts a flaky test as a failure', () => {
    const result = buildReport(reportOf([['wobbles', 'flaky']]), []);
    expect(result.summary).toBe('Firefox: 0 known failures, 1 new');
  });

  it('never reads a run that left no results as clean', () => {
    expect(buildReport(null, known).summary).toBe('Firefox: no results');
    expect(buildReport({suites: [], errors: []}, known).markdown).toContain(
      'no test ran',
    );
  });
});

describe('the known Firefox failures', () => {
  it('each names a listed hover spec, a test title and a cause label, once, in order', () => {
    expect(known.length).toBeGreaterThan(0);
    for (const failure of known) {
      expect(FIREFOX_HOVER_SPECS, failure.file).toContain(failure.file);
      expect(failure.title, failure.file).not.toBe('');
      expect(failure.tracking, failure.title).toMatch(/^[a-z0-9][a-z0-9-]*$/);
    }
    const keys = known.map(failure => `${failure.file}\u0000${failure.title}`);
    expect(keys).toEqual([...new Set(keys)].sort((a, b) => a.localeCompare(b)));
  });
});

describe('the report script', () => {
  it("labels the report with ASTRYX_HEAD_SHA before GITHUB_SHA (a pull request's test merge commit)", () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'firefox-report-'));
    const script = fileURLToPath(
      new URL('./firefox-hover-report.mjs', import.meta.url),
    );
    const run = env => {
      execFileSync(
        process.execPath,
        [script, path.join(out, 'none.json'), out],
        {
          env: {
            ...process.env,
            GITHUB_SHA: 'merge1',
            ASTRYX_HEAD_SHA: '',
            ...env,
          },
          stdio: 'ignore',
        },
      );
      return fs.readFileSync(path.join(out, 'report.md'), 'utf8');
    };
    try {
      expect(run({ASTRYX_HEAD_SHA: 'head1'})).toContain('for head1');
      expect(run({})).toContain('for merge1');
    } finally {
      fs.rmSync(out, {recursive: true, force: true});
    }
  });
});
