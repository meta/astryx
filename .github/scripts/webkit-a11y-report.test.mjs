// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {buildReport, testsOf} from './webkit-a11y-report.mjs';

const spec = (title, status, results, line = 10) => ({
  title,
  file: 'packages/core/src/Dialog/__tests__/Dialog.a11y.browser.spec.ts',
  line,
  tests: [{status, results}],
});
const report = {
  suites: [
    {
      title: 'packages/core/src/Dialog/__tests__/Dialog.a11y.browser.spec.ts',
      file: 'packages/core/src/Dialog/__tests__/Dialog.a11y.browser.spec.ts',
      specs: [spec('opens', 'expected', [{status: 'passed'}], 5)],
      suites: [
        {
          title: 'focus',
          specs: [
            spec(
              'returns focus to the trigger',
              'unexpected',
              [
                {
                  status: 'failed',
                  error: {
                    message:
                      '\x1b[31mexpected button to be focused\x1b[39m\n  at ...',
                  },
                },
              ],
              22,
            ),
            spec(
              'traps Tab',
              'flaky',
              [
                {status: 'failed', error: {message: 'timeout'}},
                {status: 'passed'},
              ],
              40,
            ),
          ],
        },
      ],
    },
  ],
};

describe('the weekly WebKit accessibility report', () => {
  it('reads every test with its outcome and first error line', () => {
    expect(
      testsOf(report).map(test => [test.title, test.status, test.error]),
    ).toEqual([
      ['opens', 'expected', ''],
      [
        'focus › returns focus to the trigger',
        'unexpected',
        'expected button to be focused',
      ],
      ['focus › traps Tab', 'flaky', 'timeout'],
    ]);
  });

  it('lists each failed and flaky test with a command that runs it again in WebKit', () => {
    const result = buildReport(report, {sha: 'abc123'});
    expect(result.ok).toBe(false);
    expect(result.counts).toEqual({failed: 1, flaky: 1, passed: 1, skipped: 0});
    expect(result.failures.map(test => test.repro)).toEqual([
      'pnpm exec playwright test packages/core/src/Dialog/__tests__/Dialog.a11y.browser.spec.ts:22 --config playwright.config.ts --project webkit',
      'pnpm exec playwright test packages/core/src/Dialog/__tests__/Dialog.a11y.browser.spec.ts:40 --config playwright.config.ts --project webkit',
    ]);
    expect(result.markdown).toContain(
      'Commit abc123. 1 failed, 1 flaky, 1 passed',
    );
    expect(result.markdown).toContain('focus › returns focus to the trigger');
  });

  it('says so when every contract passed', () => {
    const passed = {
      suites: [
        {
          title: 'x.a11y.browser.spec.ts',
          specs: [spec('opens', 'expected', [{status: 'passed'}])],
        },
      ],
    };
    const result = buildReport(passed);
    expect(result.ok).toBe(true);
    expect(result.markdown).toContain(
      'Every WebKit accessibility contract passed.',
    );
  });

  it('never reads a run that stopped on an error, or ran no test, as a pass', () => {
    const stopped = buildReport({
      suites: [],
      errors: [{message: 'Error: No tests found'}],
    });
    expect(stopped.ok).toBe(false);
    expect(stopped.markdown).toContain(
      'the run stopped on an error: Error: No tests found',
    );
    expect(stopped.markdown).not.toContain('passed');
    const empty = buildReport({suites: []});
    expect(empty.ok).toBe(false);
    expect(empty.markdown).toContain('no test ran');
  });

  it('never reads a run that left no results as a pass', () => {
    const result = buildReport(null, {sha: 'abc123'});
    expect(result.ok).toBe(false);
    expect(result.markdown).toContain('The run left no results for abc123');
  });
});
