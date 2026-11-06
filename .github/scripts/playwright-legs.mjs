#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file playwright-legs.mjs
 * @description Splits the spec files of one Playwright suite into legs of
 *   about equal running time, from the per-file times a CI run recorded
 *   (spec:AST-030 FR13).
 * @input `legs`: the suite's times key, its path filters, the changed files,
 *   a leg's setup time and time limit. `plan`: the suite's times key, its
 *   config and project, this leg and the leg count, and any Playwright path
 *   filters; `.github/playwright-leg-durations.json`. `record`: CI job logs
 *   of the list reporter.
 * @output `legs`: `count=<legs>`, `runs=<true|false>` and the `leg=<i>` this
 *   leg plans, for `$GITHUB_OUTPUT`.
 *   `plan`: this leg's spec files, one per line, for Playwright's
 *   `--test-list`, and `files=<count>` for `$GITHUB_OUTPUT`. `record`: the
 *   durations file, rewritten for the suite.
 * @position The pr-interaction, pr-interaction-webkit and docsite-browser
 *   legs in ci.yml.
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  costOf,
  medianOf,
  splitByDuration,
} from '../../scripts/lib/duration-split.mjs';
import {listedFiles} from './a11y-pr-contracts.mjs';

// CI may run this file from the workflow's own commit, outside the checkout,
// in the checkout's root.
const ROOT = process.cwd();
export const DURATIONS = path.join(
  ROOT,
  '.github/playwright-leg-durations.json',
);

/**
 * Splits `files` into `legs` lists of about equal estimated time, with the
 * shared duration splitter: slowest first, each onto the leg with the least
 * time so far. A file with no recorded time counts the median recorded time.
 * Every file lands in exactly one leg.
 */
export function planLegs(files, durations, legs) {
  if (!Number.isInteger(legs) || legs < 1)
    throw new Error(`legs must be a positive integer, got ${legs}`);
  const unique = [...new Set(files)];
  const cost = costOf(unique, durations ?? {});
  return splitByDuration(unique, legs, cost).map(leg => ({
    files: leg,
    seconds: leg.reduce((sum, file) => sum + cost(file), 0),
  }));
}

/**
 * The seconds a suite's proofs take: each listed spec file a filter selects
 * (every listed spec with no filter), and each changed spec, at its recorded
 * time. A spec with no time of its own counts its time in `fallback`
 * (another browser's); else its test count (`testsOf`) times the suite's mean
 * time a test (`perTest`); else the median time a file.
 */
export function estimateSeconds(
  times,
  filters,
  {listed = [], changed = [], fallback = {}, testsOf = () => 0, perTest} = {},
) {
  // No filter: the suite plans every listed spec.
  const files = new Set(
    filters.length === 0
      ? listed
      : listed.filter(file => filters.some(filter => file.includes(filter))),
  );
  for (const file of changed) files.add(file);
  const median = medianOf(Object.values(times));
  let seconds = 0;
  for (const file of files) {
    const tests =
      times[file] == null && fallback[file] == null && perTest > 0
        ? testsOf(file)
        : 0;
    seconds +=
      times[file] ?? fallback[file] ?? (tests > 0 ? tests * perTest : median);
  }
  return seconds;
}

// A test declaration at the start of a line: test(), test.only() and the
// like, not test.describe() or test.use().
const TEST_CALL = /^\s*(?:test|it)(?:\.(?:only|skip|fixme|fail|slow))?\s*\(/gm;

/** How many tests a spec file declares; a test inside a loop counts once. */
export function countTests(source) {
  return (source.match(TEST_CALL) ?? []).length;
}

/** The mean seconds a test, over every test of every log. */
function meanTestSeconds(texts, project, strip) {
  let seconds = 0;
  let tests = 0;
  for (const text of texts)
    for (const each of Object.values(recordLog(text, project, strip, true))) {
      seconds += each.seconds;
      tests += each.tests;
    }
  return tests > 0 ? Math.round((seconds / tests) * 100) / 100 : undefined;
}

/**
 * The fewest legs, at most `maxLegs`, in which each leg's setup and share of
 * the proofs fits `maxSeconds`. One leg while the whole estimate fits.
 */
export function legCount({seconds, setupSeconds, maxSeconds, maxLegs}) {
  if (!Number.isFinite(seconds) || seconds < 0)
    throw new Error(`the proofs' estimate is not a time: ${seconds}`);
  if (!(maxSeconds > setupSeconds) || !(maxLegs >= 1))
    throw new Error(
      'a leg needs more time than its setup, and one leg at least',
    );
  const needed = Math.ceil(seconds / (maxSeconds - setupSeconds));
  return Math.min(maxLegs, Math.max(1, needed));
}

/**
 * Whether a file is an interaction proof spec, as playwright.interaction
 * .config.ts matches them: any `*.interaction.browser.spec.ts`, and the
 * gesture system's own `*.browser.spec.ts` proofs.
 */
export function isInteractionSpec(file) {
  return (
    file.endsWith('.interaction.browser.spec.ts') ||
    /^packages\/core\/src\/gestures\/__tests__\/browser\/[^/]+\.browser\.spec\.ts$/.test(
      file,
    )
  );
}

// A suite with one unnamed project prints no `[project]`.
const TEST_LINE =
  /^(\S+Z)\s+\S+\s+\d+\s+(?:\[([\w-]+)\] › )?([^:\s]+):\d+:\d+ › /;
const RUNNING = /Running \d+ tests? using/;

/** Milliseconds of a log line's timestamp; GitHub writes seven fraction digits. */
function stamp(line) {
  return Date.parse(line.split(/\s/, 1)[0].replace(/(\.\d{3})\d*Z$/, '$1Z'));
}

/**
 * Seconds per spec file from a CI job log of the list reporter: each test's
 * time is the gap from the line before it, so a file's time includes its setup.
 * `project` picks one project's lines (none for an unnamed project), and
 * `strip` turns the printed path into the one Playwright lists (relative to
 * the config's test directory).
 */
export function recordLog(text, project, strip = '', counts = false) {
  const seconds = {};
  const tests = {};
  let previous = null;
  for (const line of text.split('\n')) {
    const at = stamp(line);
    if (previous == null && RUNNING.test(line) && Number.isFinite(at)) {
      previous = at;
      continue;
    }
    const match = TEST_LINE.exec(line);
    if (!match || previous == null || match[2] !== (project ?? undefined))
      continue;
    const time = stamp(match[1]);
    const file = match[3].startsWith(strip)
      ? match[3].slice(strip.length)
      : match[3];
    seconds[file] = (seconds[file] ?? 0) + (time - previous) / 1000;
    tests[file] = (tests[file] ?? 0) + 1;
    previous = time;
  }
  return counts
    ? Object.fromEntries(
        Object.entries(seconds).map(([file, value]) => [
          file,
          {seconds: value, tests: tests[file]},
        ]),
      )
    : seconds;
}

function readDurations(file = DURATIONS) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
}

function option(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

/** The spec files Playwright lists for a suite with these extra arguments. */
function list({config, project}, out, extra) {
  // The report goes to a file: a spec's own logging can share stdout.
  const reportFile = `${out}.list.json`;
  execFileSync(
    'pnpm',
    [
      'exec',
      'playwright',
      'test',
      '--config',
      config,
      ...(project ? ['--project', project] : []),
      '--list',
      '--reporter=json',
      ...extra,
    ],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        PLAYWRIGHT_JSON_OUTPUT_FILE: path.resolve(reportFile),
      },
      stdio: ['ignore', 'ignore', 'inherit'],
    },
  );
  const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  fs.rmSync(reportFile, {force: true});
  return listedFiles(report);
}

function plan(args) {
  const split = args.indexOf('--');
  const own = split === -1 ? args : args.slice(0, split);
  const filters = split === -1 ? [] : args.slice(split + 1);
  const key = option(own, '--key');
  const suite = {
    config: option(own, '--config'),
    project: option(own, '--project'),
  };
  const leg = Number(option(own, '--leg'));
  const legs = Number(option(own, '--of'));
  const out = option(own, '--out');
  const durations = option(own, '--durations') ?? DURATIONS;
  if (
    !key ||
    !suite.config ||
    !out ||
    !Number.isInteger(leg) ||
    leg < 1 ||
    leg > legs
  ) {
    throw new Error(
      'usage: plan --key <times key> --config <file> [--project <name>] --leg <i> --of <n> --out <file> [--durations <file>] [-- <filters...>]',
    );
  }
  const files = list(suite, out, filters);
  if (files.length === 0)
    throw new Error(`Playwright listed no ${key} spec files`);
  const legsPlan = planLegs(files, readDurations(durations)[key] ?? {}, legs);
  const mine = legsPlan[leg - 1];
  fs.writeFileSync(out, mine.files.map(file => `${file}\n`).join(''));
  // Playwright runs nothing, and passes, for a test list that matches no
  // spec, so the leg checks that its list selects exactly its files.
  if (mine.files.length > 0) {
    const selected = list(suite, out, ['--test-list', out]);
    if (selected.join('\n') !== mine.files.join('\n'))
      throw new Error(
        `The ${key} leg's test list selects ${selected.length} spec files, not its ${mine.files.length}`,
      );
  }
  console.log(
    `${key} leg ${leg}/${legs}: ${mine.files.length} of ${files.length} spec files, about ${Math.round(mine.seconds)} s`,
  );
  for (const [i, each] of legsPlan.entries())
    console.log(
      `  leg ${i + 1}: about ${Math.round(each.seconds)} s, ${each.files.length} files`,
    );
  for (const file of mine.files) console.log(`  ${file}`);
  if (process.env.GITHUB_OUTPUT)
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `files=${mine.files.length}\n`,
    );
}

function legs(args) {
  const split = args.indexOf('--');
  const own = split === -1 ? args : args.slice(0, split);
  const filters = split === -1 ? [] : args.slice(split + 1);
  const key = option(own, '--key');
  const leg = Number(option(own, '--leg'));
  const limits = {
    setupSeconds: Number(option(own, '--setup-seconds')),
    maxSeconds: Number(option(own, '--max-seconds')),
    maxLegs: Number(option(own, '--max-legs')),
  };
  if (!key || !Number.isInteger(leg) || leg < 1)
    throw new Error(
      'usage: legs --key <times key> --leg <i> --listed <file> [--source <git dir>] --setup-seconds <s> --max-seconds <s> --max-legs <n> [--fallback-key <times key>] [--durations <file>] [--changed <file>] [-- <filters...>]',
    );
  const specs = file =>
    fs.readFileSync(file, 'utf8').split('\n').filter(isInteractionSpec);
  const listedFile = option(own, '--listed');
  const listed =
    listedFile && fs.existsSync(listedFile) ? specs(listedFile) : [];
  if (listed.length === 0)
    throw new Error(`--listed names no ${key} spec files to count`);
  const changedFile = option(own, '--changed');
  // Each leg counts on its own. A leg without the changed files could count
  // fewer legs than the others and leave a share of the proofs to no leg, so
  // it plans itself as the only leg and runs every proof instead.
  if (
    own.includes('--changed') &&
    !(changedFile && fs.existsSync(changedFile))
  ) {
    console.log(
      `::warning title=Leg count without the changed files::The scope step could not list the changed files, so ${key} leg ${leg} runs every planned proof as a leg of its own.`,
    );
    if (process.env.GITHUB_OUTPUT)
      fs.appendFileSync(
        process.env.GITHUB_OUTPUT,
        'count=1\nruns=true\nleg=1\n',
      );
    return;
  }
  const durations = readDurations(option(own, '--durations') ?? DURATIONS);
  // A spec with no recorded time counts its tests, read from the merge
  // commit (the scope checkout) without a checkout of its own.
  const source = option(own, '--source');
  const testsOf = file => {
    if (!source) return 0;
    try {
      return countTests(
        execFileSync('git', ['-C', source, 'show', `HEAD:${file}`], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }),
      );
    } catch {
      return 0;
    }
  };
  const seconds = estimateSeconds(durations[key] ?? {}, filters, {
    listed,
    changed: changedFile ? specs(changedFile) : [],
    fallback: durations[option(own, '--fallback-key')] ?? {},
    testsOf,
    perTest: durations['seconds-per-test']?.[key],
  });
  const count = legCount({seconds, ...limits});
  const runs = leg <= count;
  console.log(
    `${key}: about ${Math.round(seconds)} s of proofs and ${limits.setupSeconds} s of setup a leg, so ${count} leg${count === 1 ? '' : 's'} within ${limits.maxSeconds} s; leg ${leg} ${runs ? 'runs' : 'has no share'}`,
  );
  if (process.env.GITHUB_OUTPUT)
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `count=${count}\nruns=${runs}\nleg=${leg}\n`,
    );
}

function record(args) {
  const key = option(args, '--key');
  const project = option(args, '--project');
  const strip = option(args, '--strip') ?? '';
  const valued = new Set(['--key', '--project', '--strip']);
  const logs = args.filter(
    (arg, i) => !arg.startsWith('--') && !valued.has(args[i - 1]),
  );
  if (!key || logs.length === 0)
    throw new Error(
      'usage: record --key <times key> [--project <name>] [--strip <path prefix>] <job log...>',
    );
  const seconds = {};
  const texts = logs.map(log => fs.readFileSync(log, 'utf8'));
  for (const text of texts) {
    for (const [file, value] of Object.entries(
      recordLog(text, project, strip),
    )) {
      seconds[file] = (seconds[file] ?? 0) + value;
    }
  }
  if (Object.keys(seconds).length === 0)
    throw new Error(`no ${key} test lines in the logs`);
  const durations = readDurations();
  // The mean time a test, for a spec that has no recorded time yet.
  durations['seconds-per-test'] = {
    ...durations['seconds-per-test'],
    [key]: meanTestSeconds(texts, project, strip),
  };
  durations[key] = Object.fromEntries(
    Object.entries(seconds)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([file, value]) => [file, Math.round(value * 10) / 10]),
  );
  fs.writeFileSync(DURATIONS, `${JSON.stringify(durations, null, 2)}\n`);
  console.log(
    `${key}: ${Object.keys(seconds).length} spec files recorded into ${path.relative(ROOT, DURATIONS)}`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [command, ...args] = process.argv.slice(2);
  try {
    if (command === 'legs') legs(args);
    else if (command === 'plan') plan(args);
    else if (command === 'record') record(args);
    else throw new Error('usage: playwright-legs.mjs legs|plan|record ...');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
