// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How many Node legs a CI run needs, from the recorded Node test
 *   times.
 * @input The repository's tracked files (`git ls-files`) and recorded seconds
 *   per Node test file (scripts/vitest-node-durations.json).
 * @output The leg count and whether every leg fits its budget; with `plan
 *   --github-output`, ci.yml's step outputs (`legs`, `shards`, `fits`,
 *   `reason`, `leg-widths`, `widen`).
 * @position ci.yml's `room` job runs it before admission, so one number sets
 *   test-node's matrix, the legs' full width and admission's peak at full
 *   width. The Main workflow's `main-commit` runs it with `--main` for the
 *   unit run's test-node matrix: as many legs as shorten the slowest leg
 *   (DEC-17), whose legs also run the swizzle proof's slices. Each leg's Vitest sequencer (scripts/vitest-shard-sequencer.mjs)
 *   splits the files with the same cost function (`nodeFileCost`), so the
 *   legs it plans are the legs that run. Node built-ins and repository
 *   modules only: `room` has no installed dependencies.
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {
  costOf,
  fitLegsToBudget,
  percentileOf,
  splitByDuration,
} from './lib/duration-split.mjs';
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

// The most Node legs Main's unit run starts (spec:AST-030 FR22, DEC-17). Main
// runs about once an hour, so it may hold more of the ceiling to finish inside
// its legs' limit: on the recorded suite with the swizzle proof's slices,
// twelve legs keep the slowest under about eleven minutes on a runner 1.28
// times slower than measured, where eight legs reach the fifteen-minute limit.
export const MAX_MAIN_NODE_LEGS = 12;

// The most Node legs a pull request's run starts: as many as Main's, so a
// suite that grows past one count of legs takes more legs instead of failing
// every pull request. A pull request still starts only as many as its legs
// need to fit their budget, at the widths admission picks, so it never grows
// to finish sooner. Past this count the suite itself must get faster.
export const MAX_NODE_LEGS = MAX_MAIN_NODE_LEGS;

// How much slower than measured a runner may be, and how long Main's slowest
// Node leg may take on it before main's validation warns, ahead of the
// fifteen-minute limit.
export const SLOW_RUNNER = 1.28;
export const MAIN_WARN_MINUTES = 12.5;

/**
 * A leg's projected wall time in minutes on a runner `SLOW_RUNNER` times
 * slower than measured: its setup, then its recorded test seconds at the
 * measured pace.
 * @param {number} testSeconds
 */
export function projectedLegMinutes(testSeconds) {
  return (
    (SETUP_SECONDS +
      (testSeconds / TEST_SECONDS_PER_WALL_SECOND) * SLOW_RUNNER) /
    60
  );
}

/**
 * A never-failing notice for main's validation when Main's slowest Node leg
 * would pass `MAIN_WARN_MINUTES` on a slow runner, so the record can be cut
 * down before units time out. Null otherwise.
 * @param {{longest: number, legs: number}} plan
 * @returns {string | null}
 */
export function mainNearLimitNotice(plan) {
  const minutes = projectedLegMinutes(plan.longest);
  if (minutes <= MAIN_WARN_MINUTES) return null;
  return `::warning title=Main Node legs near their limit::At ${plan.legs} legs, the slowest Node leg plans ${Math.round(plan.longest)} s of tests: about ${minutes.toFixed(1)} minutes on a runner ${SLOW_RUNNER} times slower than measured, past ${MAIN_WARN_MINUTES} of the fifteen-minute limit. Speed up or split the slowest test files.`;
}

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

/**
 * Main's full unit run spends runner-minutes to finish sooner (spec:AST-030
 * DEC-17): as many legs as shorten its slowest leg, up to `MAX_MAIN_NODE_LEGS`.
 * That is the fewest legs whose longest leg is no longer than at the most
 * legs; more would leave the slowest leg as it is (the slowest single file
 * sets that floor).
 * @param {string[]} files Main's Node test files
 * @param {Record<string, number>} seconds recorded seconds per file
 * @returns {{legs: number, fits: boolean, longest: number, total: number, reason: string}}
 */
export function planMainNodeLegs(files, seconds) {
  const cost = nodeFileCost(files, seconds);
  const total = files.reduce((sum, file) => sum + cost(file), 0);
  const longestAt = count =>
    Math.max(
      0,
      ...splitByDuration(files, count, cost).map(leg =>
        leg.reduce((sum, file) => sum + cost(file), 0),
      ),
    );
  const floor = longestAt(MAX_MAIN_NODE_LEGS);
  let legs = MAX_MAIN_NODE_LEGS;
  for (let count = 1; count < MAX_MAIN_NODE_LEGS; count += 1) {
    if (longestAt(count) <= floor) {
      legs = count;
      break;
    }
  }
  const longest = longestAt(legs);
  const fits = longest <= LEG_BUDGET_SECONDS;
  const reason = fits
    ? ''
    : `The Node suite plans ${Math.round(total)} s of tests: at ${legs} legs, as many as shorten the slowest, its longest leg plans ${Math.round(longest)} s, past the budget of ${Math.round(LEG_BUDGET_SECONDS)} s. Speed up the slowest test files.`;
  return {legs, fits, longest, total, reason};
}

/**
 * What a plan past its budget prints: a pull request's legs stop with the
 * reason (an error), Main's unit run warns and runs its legs. Null when the
 * plan fits.
 * @param {{fits: boolean, reason: string}} plan
 * @param {{main?: boolean}} [options]
 * @returns {{level: 'error' | 'warning', line: string} | null}
 */
export function overBudgetNotice(plan, {main = false} = {}) {
  if (plan.fits) return null;
  const level = main ? 'warning' : 'error';
  return {
    level,
    line: `::${level} title=Node legs over budget::${plan.reason}`,
  };
}

/**
 * Why a recorded-times file cannot be used, or null: it must parse, and its
 * `seconds` must map each file to a finite, non-negative number. A plan read
 * from an unusable record would plan every file as unrecorded and still fit.
 * @param {string} file
 * @returns {string | null}
 */
export function recordProblem(file) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return `${path.relative(ROOT, file)} cannot be read (${error.message})`;
  }
  const seconds = parsed?.seconds;
  if (seconds == null || typeof seconds !== 'object' || Array.isArray(seconds))
    return `${path.relative(ROOT, file)} has no map of seconds per file`;
  const bad = Object.entries(seconds).find(
    ([, value]) =>
      typeof value !== 'number' || !Number.isFinite(value) || value < 0,
  );
  return bad
    ? `${path.relative(ROOT, file)} records ${JSON.stringify(bad[1])} seconds for ${bad[0]}`
    : null;
}

/** The minimum Node's record, which the CLI's legs there pack by. */
export const MIN_NODE_DURATIONS = path.join(
  ROOT,
  'scripts/vitest-node-durations.min-node.json',
);

/** The recorded-times files: the Node legs' and the minimum Node's. */
export const RECORDS = [DURATIONS, MIN_NODE_DURATIONS];

// The CLI's legs on its minimum Node (cli-minimum-node.yml): as many as keep
// the slowest leg near MIN_NODE_TARGET_MINUTES, well inside the job's 30-minute
// limit and its watchdog at 28. Measured over the four legs of run
// 44258944787 on Node 22.13: about 40 s from the job's start to the test step,
// and 2.40 to 2.48 recorded test seconds a second of the step. The setup booked
// here is three times the measured one, and each file adds its import time on
// top of that pace, so the projection runs 2 to 3 minutes above the legs: a
// slower runner day still keeps the slowest leg near the target.
export const MIN_NODE_TARGET_MINUTES = 20;
export const MIN_NODE_SETUP_SECONDS = 120;
export const MIN_NODE_TEST_SECONDS_PER_WALL_SECOND = 2.4;
// Past this many legs the CLI's tests must get faster instead.
export const MAX_MIN_NODE_LEGS = 10;
// The legs the workflow starts when the plan cannot run.
export const MIN_NODE_FALLBACK_LEGS = 6;

/** Recorded test seconds one minimum-Node leg may plan. */
export const MIN_NODE_LEG_BUDGET_SECONDS =
  (MIN_NODE_TARGET_MINUTES * 60 - MIN_NODE_SETUP_SECONDS) *
  MIN_NODE_TEST_SECONDS_PER_WALL_SECOND;

/**
 * A minimum-Node leg's projected wall time in minutes: its setup, then its
 * recorded test seconds at the measured pace.
 * @param {number} testSeconds
 */
export function minNodeLegMinutes(testSeconds) {
  return (
    (MIN_NODE_SETUP_SECONDS +
      testSeconds / MIN_NODE_TEST_SECONDS_PER_WALL_SECOND) /
    60
  );
}

/**
 * The fewest legs, up to `MAX_MIN_NODE_LEGS`, whose slowest leg plans at most
 * `MIN_NODE_LEG_BUDGET_SECONDS`, split as the sequencer splits by the
 * minimum-Node record. A suite past the budget at the most legs warns and
 * runs the most legs: the daily run never stops for its plan.
 * @param {string[]} files the CLI's test files
 * @param {Record<string, number>} seconds the minimum-Node record's seconds
 * @returns {{legs: number, fits: boolean, longest: number, total: number, minutes: number, reason: string}}
 */
export function planMinNodeLegs(files, seconds) {
  const cost = nodeFileCost(files, seconds);
  const total = files.reduce((sum, file) => sum + cost(file), 0);
  const plan = fitLegsToBudget(files, cost, {
    budget: MIN_NODE_LEG_BUDGET_SECONDS,
    maxLegs: MAX_MIN_NODE_LEGS,
  });
  const legs = Math.max(1, plan.count);
  const fits = plan.longest <= MIN_NODE_LEG_BUDGET_SECONDS;
  const minutes = minNodeLegMinutes(plan.longest);
  const reason = fits
    ? ''
    : `The CLI's tests plan ${Math.round(total)} s on the minimum Node: at ${legs} legs, the most it starts, the slowest leg plans ${Math.round(plan.longest)} s, about ${minutes.toFixed(1)} minutes, past the ${MIN_NODE_TARGET_MINUTES}-minute target. Speed up the slowest CLI test files.`;
  return {legs, fits, longest: plan.longest, total, minutes, reason};
}

/** The CLI's test files: what `pnpm -F @astryxdesign/cli test` collects. */
export function minNodeLegFiles(root = ROOT) {
  return nodeLegFiles(root, {swizzleProofOwnJob: false}).filter(file =>
    file.startsWith('packages/cli/'),
  );
}

/** Recorded seconds per Node test file, or none when the record cannot be read. */
export function readDurations(file = DURATIONS) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')).seconds ?? {};
  } catch {
    return {};
  }
}

/**
 * The Node legs' test files. A pull request runs the swizzle proof's slices in
 * a job of their own; Main's unit run runs them in its Node legs
 * (`swizzleProofOwnJob: false`).
 * @param {string} [root]
 * @param {{swizzleProofOwnJob?: boolean}} [options]
 */
export function nodeLegFiles(root = ROOT, {swizzleProofOwnJob = true} = {}) {
  const tracked = execFileSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\0')
    .filter(Boolean);
  return nodeTestFiles(tracked, {swizzleProofOwnJob});
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
      "usage: node scripts/vitest-node-legs.mjs plan [--main | --min-node] [--other-widths '<json>'] [--github-output]",
    );
    process.exit(2);
  }
  if (argv.includes('--min-node')) {
    const files = minNodeLegFiles();
    const seconds = readDurations(MIN_NODE_DURATIONS);
    const problem = recordProblem(MIN_NODE_DURATIONS);
    const planned = planMinNodeLegs(files, seconds);
    const plan = problem
      ? {
          ...planned,
          legs: MIN_NODE_FALLBACK_LEGS,
          fits: false,
          reason: `The minimum-Node record cannot be used: ${problem}.`,
        }
      : planned;
    console.log(
      problem
        ? `${plan.reason} The workflow starts ${plan.legs} legs.`
        : `${files.length} CLI test files plan ${Math.round(plan.total)} s on the minimum Node: ${plan.legs} legs, the slowest ${Math.round(plan.longest)} s, about ${plan.minutes.toFixed(1)} minutes (target ${MIN_NODE_TARGET_MINUTES}).`,
    );
    const outputs = {
      legs: String(plan.legs),
      shards: JSON.stringify(Array.from({length: plan.legs}, (_, i) => i + 1)),
    };
    if (argv.includes('--github-output'))
      fs.appendFileSync(
        process.env.GITHUB_OUTPUT,
        Object.entries(outputs)
          .map(([key, value]) => `${key}=${value}\n`)
          .join(''),
      );
    else console.log(JSON.stringify(outputs));
    // The daily run never stops for its plan: it runs its legs and warns.
    if (!plan.fits)
      console.log(
        `::warning title=Minimum-Node legs over target::${plan.reason}`,
      );
    process.exit(0);
  }
  const main = argv.includes('--main');
  const files = nodeLegFiles(ROOT, {swizzleProofOwnJob: !main});
  const seconds = readDurations();
  const planned = main
    ? planMainNodeLegs(files, seconds)
    : planNodeLegs(files, seconds);
  // A record that cannot be used fails the plan, as one past its budget
  // does: a change only to the recorded times runs only this check and the
  // tests that read them.
  const problem = RECORDS.map(recordProblem).find(Boolean);
  const plan = problem
    ? {
        ...planned,
        fits: false,
        reason: `The recorded Node test times cannot be used: ${problem}.`,
      }
    : planned;
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
  // Main's unit run never stops for its plan: it runs its legs and warns.
  const notice = overBudgetNotice(plan, {main});
  if (notice) {
    console.log(notice.line);
    if (notice.level === 'error') process.exit(1);
  }
  const nearLimit = main ? mainNearLimitNotice(plan) : null;
  if (nearLimit) console.log(nearLimit);
}
