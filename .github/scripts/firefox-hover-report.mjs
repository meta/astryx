// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The Firefox hover specs' report.
 * @input Playwright's JSON report of `playwright.config.ts`'s `firefox` project
 *   (FIREFOX_HOVER_SPECS), and the known failures in
 *   .github/firefox-known-failures.json.
 * @output A Markdown report on stdout (the step summary) and in
 *   `<out>/report.md`, with `<out>/report.json`. Its first line counts the
 *   known and the new failures. One annotation per failure: an error for a new
 *   one, a warning for a known one (with its cause label), and a notice for a
 *   known one that now passes. It always exits 0: the Firefox runs are
 *   report-only. A run without results is never clean (noResultsReason, shared
 *   with the WebKit report).
 * @position The Firefox steps in ci.yml run it after the specs.
 */

import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

import {noResultsReason, runErrorsOf, testsOf} from './webkit-a11y-report.mjs';

const CONFIG = 'playwright.config.ts';
const KNOWN = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '../firefox-known-failures.json',
);

/** One key per test: its spec file and its title path. */
const keyOf = test => `${test.file}\u0000${test.title}`;
const plural = (count, one, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;
const cell = text => String(text).replace(/\|/g, '\\|');

/**
 * The report for one run against the known failures.
 * @param {any} report Playwright's JSON report, or null when the run left none
 * @param {{file: string, title: string, tracking: string}[]} known
 * @param {{sha?: string}} [options]
 */
export function buildReport(report, known, {sha = ''} = {}) {
  const tests = report ? testsOf(report) : [];
  const knownByKey = new Map(known.map(entry => [keyOf(entry), entry]));
  const errors = runErrorsOf(report);
  const why = noResultsReason(report, errors);
  if (why) {
    return {
      summary: 'Firefox: no results',
      known: [],
      added: [],
      fixed: [],
      errors,
      markdown: `Firefox: no results\n\n# Firefox hover specs (report-only)\n\nThe run left no results${sha ? ` for ${sha}` : ''}: ${why}. See the run's log.\n`,
    };
  }
  const failed = tests
    .filter(test => test.status === 'unexpected' || test.status === 'flaky')
    .map(test => ({
      ...test,
      repro: `pnpm exec playwright test ${test.file}:${test.line} --config ${CONFIG} --project firefox`,
    }));
  const knownFailures = failed
    .filter(test => knownByKey.has(keyOf(test)))
    .map(test => ({...test, tracking: knownByKey.get(keyOf(test)).tracking}));
  const added = failed.filter(test => !knownByKey.has(keyOf(test)));
  const passed = new Set(
    tests
      .filter(test => test.ran && test.status === 'expected')
      .map(test => keyOf(test)),
  );
  const fixed = known.filter(entry => passed.has(keyOf(entry)));
  // A serial spec file skips its later tests after a failure. Playwright
  // records them as skipped, with no skip annotation: they did not run.
  const notRun = tests.filter(
    test => !test.ran || (test.status === 'skipped' && !test.skippedOnPurpose),
  ).length;
  const summary = `Firefox: ${plural(knownFailures.length, 'known failure')}, ${added.length} new${fixed.length ? `, ${plural(fixed.length, 'known failure')} now ${fixed.length === 1 ? 'passes' : 'pass'}` : ''}${notRun ? `, ${notRun} not run` : ''}`;
  const rows = list =>
    list.map(
      test =>
        `| \`${test.file}\` | ${cell(test.title)} | ${cell(test.error.slice(0, 200))}${test.tracking ? ` | ${test.tracking}` : ''} | \`${test.repro}\` |`,
    );
  const markdown = [
    summary,
    '',
    '# Firefox hover specs (report-only)',
    '',
    `${sha ? `Commit ${sha}. ` : ''}A failure here fails no check. A new failure is one that is not in .github/firefox-known-failures.json: the change may have added it.`,
    '',
    ...(errors.length
      ? [
          `The run stopped on ${plural(errors.length, 'error')}, so this is not a full run:`,
          '',
          ...errors.map(error => `- ${error}`),
          '',
        ]
      : []),
    ...(added.length
      ? [
          '## New failures',
          '',
          '| Spec | Test | Error | Run it again |',
          '| --- | --- | --- | --- |',
          ...rows(added),
          '',
        ]
      : []),
    ...(fixed.length
      ? [
          '## Known failures that now pass',
          '',
          'Remove them from .github/firefox-known-failures.json.',
          '',
          ...fixed.map(entry => `- \`${entry.file}\`: ${entry.title}`),
          '',
        ]
      : []),
    ...(knownFailures.length
      ? [
          '## Known failures',
          '',
          '| Spec | Test | Error | Cause | Run it again |',
          '| --- | --- | --- | --- | --- |',
          ...rows(knownFailures),
          '',
        ]
      : []),
  ].join('\n');
  return {summary, known: knownFailures, added, fixed, errors, markdown};
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
  const known = JSON.parse(fs.readFileSync(KNOWN, 'utf8')).failures;
  const result = buildReport(report, known, {
    // On a pull request, GITHUB_SHA is GitHub's test merge commit.
    sha: process.env.ASTRYX_HEAD_SHA || process.env.GITHUB_SHA || '',
  });
  if (outDir) {
    fs.mkdirSync(outDir, {recursive: true});
    fs.writeFileSync(path.join(outDir, 'report.md'), result.markdown);
    fs.writeFileSync(
      path.join(outDir, 'report.json'),
      `${JSON.stringify({summary: result.summary, known: result.known, added: result.added, fixed: result.fixed, errors: result.errors}, null, 2)}\n`,
    );
  }
  if (result.summary === 'Firefox: no results')
    console.log('::warning::The Firefox hover run left no results.');
  for (const test of result.added)
    console.log(
      `::error file=${test.file},line=${test.line},title=New Firefox failure::${test.title} (report-only; not in .github/firefox-known-failures.json)`,
    );
  for (const test of result.known)
    console.log(
      `::warning file=${test.file},line=${test.line},title=Known Firefox failure::${test.title} (${test.tracking})`,
    );
  for (const entry of result.fixed)
    console.log(
      `::notice file=${entry.file},title=Known Firefox failure now passes::${entry.title}`,
    );
  process.stdout.write(result.markdown);
}
