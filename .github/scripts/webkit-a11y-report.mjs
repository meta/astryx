// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The weekly WebKit accessibility report (spec:AST-030 DEC-24).
 * @input Playwright's JSON report of `playwright.config.ts`'s `webkit` project
 *   on the weekly run.
 * @output A Markdown report on stdout (the step summary), and `report.md` and
 *   `report.json` in the output folder: each failed or flaky test with its
 *   spec, error and a command that runs it again. One warning annotation per
 *   failure. It always exits 0: the run is report-only, so a failure never
 *   fails the job or the weekly verdict.
 * @position The `webkit-weekly-a11y` job in ci.yml runs it after the specs.
 */

import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const CONFIG = 'playwright.config.ts';

/**
 * Every test in a Playwright JSON report, with its outcome.
 * @param {any} report Playwright's JSON report
 * @returns {{file: string, line: number, title: string, status: string, ran: boolean, error: string}[]}
 */
export function testsOf(report) {
  const tests = [];
  const walk = (suite, titles) => {
    const here =
      suite.title && !suite.title.endsWith('.ts')
        ? [...titles, suite.title]
        : titles;
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const results = test.results ?? [];
        const failed = results.find(
          result => result.status !== 'passed' && result.status !== 'skipped',
        );
        const message =
          failed?.error?.message ?? failed?.errors?.[0]?.message ?? '';
        // A run that stops early leaves its other tests skipped with no
        // result, or interrupted. A test a spec skips on purpose has a skip
        // or fixme annotation.
        const skippedOnPurpose = (test.annotations ?? []).some(
          (/** @type {any} */ a) => a.type === 'skip' || a.type === 'fixme',
        );
        const ran =
          skippedOnPurpose ||
          (results.length > 0 &&
            results.every(result => result.status !== 'interrupted') &&
            (test.status !== 'skipped' ||
              results.some(result => result.status === 'skipped')));
        tests.push({
          file: spec.file ?? suite.file,
          line: spec.line,
          title: [...here, spec.title].join(' › '),
          status: test.status,
          ran,
          error:
            message
              .replace(/\x1b\[[0-9;]*m/g, '')
              .split('\n')
              .find(Boolean) ?? '',
        });
      }
    }
    for (const child of suite.suites ?? []) walk(child, here);
  };
  for (const suite of report.suites ?? []) walk(suite, []);
  return tests;
}

/**
 * The report for one run: the failed (`unexpected`) and flaky tests, each with
 * a command that runs it again in WebKit, and any error that stopped the run.
 * @param {any} report Playwright's JSON report, or null when the run left none
 * @param {{sha?: string}} [options]
 */
export function buildReport(report, {sha = ''} = {}) {
  const tests = report ? testsOf(report) : [];
  // A run that left no report, stopped on an error, or ran no test is never a
  // pass: no spec matched, or a spec failed to load before its tests. A run
  // that stopped on an error after some tests ran keeps their results.
  const errors = (report?.errors ?? []).map(
    (/** @type {any} */ error) =>
      String(error?.message ?? error)
        .replace(/\x1b\[[0-9;]*m/g, '')
        .split('\n')
        .find(Boolean) ?? '',
  );
  if (!report || tests.length === 0) {
    const why = !report
      ? 'the specs did not run to the end'
      : errors.length > 0
        ? `the run stopped on ${errors.length === 1 ? 'an error' : `${errors.length} errors`}: ${errors.join('; ')}`
        : 'no test ran (no spec file matched)';
    return {
      ok: false,
      counts: null,
      failures: [],
      errors,
      markdown: `# WebKit accessibility contracts (report-only)\n\nThe run left no results${sha ? ` for ${sha}` : ''}: ${why}. See the run's log.\n`,
    };
  }
  const count = status =>
    tests.filter(test => test.ran && test.status === status).length;
  const counts = {
    failed: count('unexpected'),
    flaky: count('flaky'),
    passed: count('expected'),
    skipped: count('skipped'),
    notRun: tests.filter(test => !test.ran).length,
  };
  const failures = tests
    .filter(test => test.status === 'unexpected' || test.status === 'flaky')
    .map(test => ({
      ...test,
      repro: `pnpm exec playwright test ${test.file}:${test.line} --config ${CONFIG} --project webkit`,
    }));
  const rows = failures.map(
    test =>
      `| ${test.status === 'flaky' ? 'flaky' : 'failed'} | \`${test.file}\` | ${test.title.replace(/\|/g, '\\|')} | ${test.error.replace(/\|/g, '\\|').slice(0, 200)} | \`${test.repro}\` |`,
  );
  const markdown = [
    '# WebKit accessibility contracts (report-only)',
    '',
    `${sha ? `Commit ${sha}. ` : ''}${counts.failed} failed, ${counts.flaky} flaky, ${counts.passed} passed, ${counts.skipped} skipped${counts.notRun ? `, ${counts.notRun} not run` : ''}. A failure here holds no release; each goes to the fix loop with the command below.`,
    '',
    ...(errors.length
      ? [
          `The run stopped on ${errors.length === 1 ? 'an error' : `${errors.length} errors`}, so this is not a pass:`,
          '',
          ...errors.map(error => `- ${error}`),
          '',
        ]
      : []),
    ...(counts.notRun
      ? [
          `The run stopped before ${counts.notRun} of ${tests.length} tests ran, so this is not a pass. See the run's log.`,
          '',
        ]
      : []),
    ...(failures.length
      ? [
          '| Result | Spec | Test | Error | Run it again |',
          '| --- | --- | --- | --- | --- |',
          ...rows,
        ]
      : counts.notRun || errors.length
        ? []
        : ['Every WebKit accessibility contract passed.']),
    '',
  ].join('\n');
  return {
    ok: counts.failed === 0 && counts.notRun === 0 && errors.length === 0,
    counts,
    failures,
    errors,
    markdown,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [input, outDir] = process.argv.slice(2);
  let report = null;
  try {
    report = JSON.parse(fs.readFileSync(input, 'utf8'));
  } catch {
    report = null;
  }
  const result = buildReport(report, {sha: process.env.GITHUB_SHA ?? ''});
  if (outDir) {
    fs.mkdirSync(outDir, {recursive: true});
    fs.writeFileSync(path.join(outDir, 'report.md'), result.markdown);
    fs.writeFileSync(
      path.join(outDir, 'report.json'),
      `${JSON.stringify({counts: result.counts, failures: result.failures, errors: result.errors}, null, 2)}\n`,
    );
  }
  if (!result.counts)
    console.log('::warning::The WebKit accessibility run left no results.');
  for (const test of result.failures)
    console.log(
      `::warning file=${test.file},line=${test.line}::WebKit accessibility ${test.status === 'flaky' ? 'flaky' : 'failure'} (report-only): ${test.title}`,
    );
  process.stdout.write(result.markdown);
}
