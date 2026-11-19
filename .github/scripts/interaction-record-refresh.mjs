#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Keeps the recorded interaction spec times
 *   (`.github/playwright-leg-durations.json`) close to main, as the Node
 *   record's refresh does for the Node times.
 * @input `median --key <times key> <run times>...`: one file per run, its
 *   recorded times (`times`: spec file → seconds) and mean time a test
 *   (`perTest`). `coverage --key <times key>
 *   [--github-summary]`: the record and the interaction spec files git
 *   tracks. `pr --run-url <url>...`: the regenerated record and `gh`.
 * @output `median` writes each spec's median over those runs under the key,
 *   and the median mean time a test, so one slow or fast run does not move a
 *   time alone. `coverage` prints how many spec files the record times and, below
 *   nine in ten, an early warning (a workflow warning and a step summary
 *   line); it always exits 0. `pr` opens the refresh pull request, or edits
 *   the open one, so at most one is ever open.
 * @position interaction-record-refresh.yml, after it re-records the times from
 *   main's latest full Chromium and weekly WebKit runs with
 *   `playwright-legs.mjs record`.
 */
/* global console, process */
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {coverage, openOrRefresh, percent} from './node-record-refresh.mjs';
import {DURATIONS, isInteractionSpec} from './playwright-legs.mjs';

export const BRANCH = 'ci/interaction-durations-refresh';
export const TITLE = 'ci: refresh the recorded interaction test times';
/** Below this share of timed spec files, the refresh warns. */
export const MIN_TIMED_SHARE = 0.9;

/**
 * How many of the interaction spec files the record times under one key
 * (the Node refresh's `coverage`, at this record's own bar).
 * @param {string[]} specs
 * @param {Record<string, number>} recorded
 */
export function specCoverage(specs, recorded) {
  return coverage(specs, recorded, {minShare: MIN_TIMED_SHARE});
}

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

/**
 * Each spec file's median time over the runs that timed it, to a tenth of a
 * second. A file that one run timed keeps that time.
 * @param {Record<string, number>[]} runs
 * @returns {Record<string, number>}
 */
export function medianTimes(runs) {
  /** @type {Map<string, number[]>} */
  const times = new Map();
  for (const run of runs)
    for (const [file, seconds] of Object.entries(run))
      times.set(file, [...(times.get(file) ?? []), seconds]);
  return Object.fromEntries(
    [...times]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([file, values]) => [file, Math.round(medianOf(values) * 10) / 10]),
  );
}

/** @param {number[]} values */
function medianOf(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * The early warning for a record that times too few spec files, or nothing.
 * @param {string} key
 * @param {ReturnType<typeof specCoverage>} covered
 */
export function earlyWarning(key, {total, recorded, share, fresh}) {
  if (fresh) return '';
  return `Early warning: the ${key} record times ${recorded} of ${total} interaction spec files (${percent(share)}), under nine in ten. Each untimed spec is costed at the other browser's time, else at its tests times the mean time a test, so its legs can run past the time they planned.`;
}

/**
 * The refresh pull request's body.
 * @param {{runs: string[], lines: string[]}} input
 */
export function prBody({runs, lines}) {
  return [
    '## What changes',
    '',
    "The recorded interaction spec times in `.github/playwright-leg-durations.json`: each spec's median over these full runs of `main`, each run recorded with `node .github/scripts/playwright-legs.mjs record`:",
    '',
    ...runs.map(url => `- ${url}`),
    '',
    'The legs split the suite by these times; which spec files run never depends on them.',
    '',
    '## Coverage',
    '',
    ...lines.map(line => `- ${line}`),
    '',
    `Opened by the interaction record refresh from the fixed branch \`${BRANCH}\`. A later refresh force-updates that branch and this pull request instead of opening another, so each refresh needs a new review at its head.`,
    '',
    'A pull request opened with the workflow token starts no CI: someone with write access reopens it to start CI.',
  ].join('\n');
}

/** The interaction spec files git tracks. */
function trackedSpecs() {
  return execFileSync('git', ['ls-files'], {cwd: ROOT, encoding: 'utf8'})
    .split('\n')
    .filter(isInteractionSpec);
}

function coverageLine(key, durations, specs) {
  const covered = specCoverage(specs, durations[key] ?? {});
  return {
    line: `${key}: ${covered.recorded} of ${covered.total} spec files timed (${percent(covered.share)})`,
    warning: earlyWarning(key, covered),
  };
}

function main(args) {
  const [command] = args;
  const values = name =>
    args.flatMap((arg, i) => (arg === name ? [args[i + 1]] : []));
  const durations = JSON.parse(fs.readFileSync(DURATIONS, 'utf8'));
  if (command === 'median' && values('--key').length === 1) {
    const [key] = values('--key');
    const files = args
      .slice(1)
      .filter(
        (arg, i, rest) => !arg.startsWith('--') && rest[i - 1] !== '--key',
      );
    if (files.length === 0)
      throw new Error('median needs one times file per run');
    const runs = files.map(file => JSON.parse(fs.readFileSync(file, 'utf8')));
    durations[key] = medianTimes(runs.map(run => run.times));
    // The mean time a test, for a spec with no recorded time: its median too.
    const perTest = runs
      .map(run => run.perTest)
      .filter(value => typeof value === 'number');
    if (perTest.length)
      durations['seconds-per-test'] = {
        ...durations['seconds-per-test'],
        [key]: medianOf(perTest),
      };
    fs.writeFileSync(DURATIONS, `${JSON.stringify(durations, null, 2)}\n`);
    console.log(
      `${key}: the median of ${files.length} run(s) for ${Object.keys(durations[key]).length} spec files`,
    );
    return;
  }
  const specs = trackedSpecs();
  if (command === 'coverage' && values('--key').length) {
    for (const key of values('--key')) {
      const {line, warning} = coverageLine(key, durations, specs);
      console.log(line);
      if (warning)
        console.log(`::warning title=Interaction record coverage::${warning}`);
      if (args.includes('--github-summary') && process.env.GITHUB_STEP_SUMMARY)
        fs.appendFileSync(
          process.env.GITHUB_STEP_SUMMARY,
          `${[line, warning].filter(Boolean).join('\n\n')}\n\n`,
        );
    }
    return;
  }
  if (command === 'pr' && values('--run-url').length) {
    const lines = ['interaction-chromium', 'interaction-webkit'].map(key => {
      const {line, warning} = coverageLine(key, durations, specs);
      return warning ? `${line}. ${warning}` : line;
    });
    const gh = ghArgs =>
      execFileSync('gh', ghArgs, {cwd: ROOT, encoding: 'utf8'});
    const {action, url} = openOrRefresh(gh, {
      branch: BRANCH,
      title: TITLE,
      body: prBody({runs: values('--run-url'), lines}),
    });
    console.log(`${action === 'created' ? 'Opened' : 'Refreshed'} ${url}`);
    return;
  }
  throw new Error(
    'usage: interaction-record-refresh.mjs median --key <times key> <run times>... | coverage --key <times key>... [--github-summary] | pr --run-url <url>...',
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
