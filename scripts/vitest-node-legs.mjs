// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How many Node legs a pull-request CI run needs, from the recorded
 *   Node test times.
 * @input The repository's tracked files (`git ls-files`) and recorded seconds
 *   per Node test file (scripts/vitest-node-durations.json).
 * @output The leg count and whether every leg fits its budget; with `plan
 *   --github-output`, ci.yml's step outputs (`legs`, `shards`, `fits`,
 *   `reason`, `leg-widths`, `widen`).
 * @position ci.yml's `room` job runs it before admission, so one number sets
 *   test-node's matrix, the legs' full width and admission's peak at full
 *   width. Each leg's Vitest sequencer (scripts/vitest-shard-sequencer.mjs)
 *   splits the files with the same cost function (`nodeFileCost`), so the
 *   legs it plans are the legs that run. Node built-ins and repository
 *   modules only: `room` has no installed dependencies.
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {costOf, fitLegsToBudget, percentileOf} from './lib/duration-split.mjs';
import {nodeTestFiles} from './vitest-node-files.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DURATIONS = path.join(ROOT, 'scripts/vitest-node-durations.json');

// Seconds of import and transform per Node test file, as the legs report.
// The recorded times leave it out; without it the hundreds of files recorded
// at 0 s would all go to one leg.
export const PER_FILE_SECONDS = 0.4;

// A Node test file with no recorded time is usually a new one, and new files
// are often slow (one unrecorded file ran 290 s): booked at the median, 0.4 s,
// it lands on a leg as if it cost nothing. It counts as the time nine recorded
// files in ten stay within (about 10 s), so its leg keeps room for it.
export const UNRECORDED_PERCENTILE = 0.9;

// test-node's `timeout-minutes`.
export const JOB_LIMIT_SECONDS = 15 * 60;
// The shard watchdog fires this long before the job limit (ci.yml
// VITEST_SHARD_WATCHDOG_SECONDS), so a leg that runs long names its files.
export const WATCHDOG_MARGIN_SECONDS = 60;
// The longest a leg takes from its job's start until Vitest starts:
// checkout, install, the Core build and a scoped run's two listings. Measured
// at most 96 s to the test step and 21 s of listing in it, over 65 legs.
export const SETUP_SECONDS = 120;
// Recorded test seconds a leg's Vitest finishes per second of wall time on
// the four-core runner (three test files at once): 2.62 to 2.89 over 21 legs.
export const TEST_SECONDS_PER_WALL_SECOND = 2.6;
// The most a leg ran over the time the record planned for it, in a replay of
// four full runs' Node legs split by this cost: 1.34 times.
export const RECORD_DRIFT = 1.35;

/** Vitest seconds a leg has before the watchdog fires. */
export const WALL_SECONDS =
  JOB_LIMIT_SECONDS - WATCHDOG_MARGIN_SECONDS - SETUP_SECONDS;

/**
 * Recorded test seconds one leg may plan: its wall time before the watchdog,
 * at the slowest measured pace, less the most a leg ran over its plan.
 */
export const LEG_BUDGET_SECONDS =
  (WALL_SECONDS * TEST_SECONDS_PER_WALL_SECOND) / RECORD_DRIFT;

// The most Node legs a run starts. Past it the suite itself must get faster:
// a run of eight legs already holds eight of CI's ninety jobs.
export const MAX_NODE_LEGS = 8;

// Node legs that run at once when CI is tight (admission's `leg-widths`), so
// many open pull requests cannot flood the shared runner pool. Admission's
// `peak` counts them.
export const TIGHT_NODE_LEGS = 2;

/**
 * Seconds per Node test file for a split: its recorded time (the
 * `UNRECORDED_PERCENTILE` of the recorded files when it has none), 0 for a
 * file that runs no test in this run, plus its import and transform.
 * @param {string[]} files
 * @param {Record<string, number>} seconds
 * @param {{idle?: Set<string>}} [options]
 * @returns {(file: string) => number}
 */
export function nodeFileCost(files, seconds, {idle = new Set()} = {}) {
  const recorded = costOf(files, seconds, {
    estimate: values => percentileOf(values, UNRECORDED_PERCENTILE),
  });
  return file => (idle.has(file) ? 0 : recorded(file)) + PER_FILE_SECONDS;
}

/**
 * The fewest legs, up to `MAX_NODE_LEGS`, whose every leg plans at most
 * `LEG_BUDGET_SECONDS`, split as the sequencer splits.
 * @param {string[]} files the Node legs' test files
 * @param {Record<string, number>} seconds recorded seconds per file
 * @returns {{legs: number, fits: boolean, longest: number, total: number, reason: string}}
 */
export function planNodeLegs(files, seconds) {
  const cost = nodeFileCost(files, seconds);
  const total = files.reduce((sum, file) => sum + cost(file), 0);
  const plan = fitLegsToBudget(files, cost, {
    budget: LEG_BUDGET_SECONDS,
    maxLegs: MAX_NODE_LEGS,
  });
  const legs = Math.max(1, plan.count);
  const fits = plan.longest <= LEG_BUDGET_SECONDS;
  const slowest = [...files].sort((a, b) => cost(b) - cost(a))[0];
  const reason = fits
    ? ''
    : cost(slowest) > LEG_BUDGET_SECONDS
      ? `${slowest} alone plans ${Math.round(cost(slowest))} s, past one Node leg's budget of ${Math.round(LEG_BUDGET_SECONDS)} s. Split or speed up that file.`
      : `The Node suite plans ${Math.round(total)} s of tests: at ${MAX_NODE_LEGS} legs, the most a run starts, its longest leg plans ${Math.round(plan.longest)} s, past the budget of ${Math.round(LEG_BUDGET_SECONDS)} s. Speed up the slowest test files.`;
  return {legs, fits, longest: plan.longest, total, reason};
}

/** Recorded seconds per Node test file, or none when the record cannot be read. */
export function readDurations(file = DURATIONS) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')).seconds ?? {};
  } catch {
    return {};
  }
}

/** The Node legs' test files: CI runs the swizzle proof's slices elsewhere. */
export function nodeLegFiles(root = ROOT) {
  const tracked = execFileSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\0')
    .filter(Boolean);
  return nodeTestFiles(tracked, {swizzleProofOwnJob: true});
}

/**
 * ci.yml's outputs for a plan: the matrix, the widths admission picks from
 * (beside the other widening matrices' `otherWidths`), and the jobs the run
 * adds at full width.
 * @param {{legs: number, fits: boolean, reason: string}} plan
 * @param {Record<string, {tight: number, full: number}>} otherWidths
 */
export function stepOutputs(plan, otherWidths) {
  const widths = {
    'test-node': {tight: Math.min(TIGHT_NODE_LEGS, plan.legs), full: plan.legs},
    ...otherWidths,
  };
  const widen = Object.values(widths).reduce(
    (sum, width) => sum + width.full - width.tight,
    0,
  );
  return {
    legs: String(plan.legs),
    shards: JSON.stringify(Array.from({length: plan.legs}, (_, i) => i + 1)),
    fits: String(plan.fits),
    reason: plan.reason,
    'leg-widths': JSON.stringify(widths),
    widen: String(widen),
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const argv = process.argv.slice(2);
  const at = argv.indexOf('--other-widths');
  if (argv[0] !== 'plan' || (at !== -1 && argv[at + 1] == null)) {
    console.error(
      "usage: node scripts/vitest-node-legs.mjs plan [--other-widths '<json>'] [--github-output]",
    );
    process.exit(2);
  }
  const files = nodeLegFiles();
  const seconds = readDurations();
  const plan = planNodeLegs(files, seconds);
  const outputs = stepOutputs(plan, at === -1 ? {} : JSON.parse(argv[at + 1]));
  const unrecorded = files.filter(file => !Object.hasOwn(seconds, file));
  console.log(
    `${files.length} Node test files (${unrecorded.length} with no recorded time) plan ${Math.round(plan.total)} s of tests: ${plan.legs} legs, the longest ${Math.round(plan.longest)} s, against a budget of ${Math.round(LEG_BUDGET_SECONDS)} s a leg (${WALL_SECONDS} s of Vitest at ${TEST_SECONDS_PER_WALL_SECOND} test seconds a second, over ${RECORD_DRIFT} for drift).`,
  );
  if (argv.includes('--github-output'))
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      Object.entries(outputs)
        .map(([key, value]) => `${key}=${value}\n`)
        .join(''),
    );
  else console.log(JSON.stringify(outputs));
  if (!plan.fits) {
    console.log(`::error title=Node legs over budget::${plan.reason}`);
    process.exit(1);
  }
}
