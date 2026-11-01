#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Which accessibility contract tests one release shard runs.
 * @input `--shard <i>/<n>`; the contract suite as `playwright test --list`
 *   reports it; recorded seconds per test and per file
 *   (.github/a11y-contract-durations.json).
 * @output A Playwright `--test-list` file on stdout; with `record <log>…`, a
 *   fresh durations file from contract leg logs.
 * @position The a11y-contracts-shard legs in ci.yml. Playwright's own `--shard`
 *   splits files in path order by test count, but per-test cost differs by
 *   orders of magnitude (fixture checks take milliseconds, binding states
 *   seconds), so one leg idled while another ran three times as long. This
 *   assigns every listed test to exactly one leg, choosing the split that
 *   finishes soonest when each leg runs its files in path order on its
 *   workers, using the recorded seconds (a test with none counts as its
 *   file's average, or the median). The numbers only steer balance; coverage
 *   never depends on them, and the partition proves every test is selected
 *   by exactly one leg's list. A file longer than one leg's fair share is cut
 *   into consecutive runs of its tests, each in a different leg, so the
 *   longest file no longer sets the release check's wall-clock. A leg still
 *   runs its part of a file in declaration order on one worker. A file is
 *   never cut when its titles cannot be named exactly in a test list, or when
 *   it runs serially.
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const DURATIONS = path.join(ROOT, '.github/a11y-contract-durations.json');
const WORKERS = 4;

const PROJECT = 'chromium';
const DELIMITER = ' \u203A ';

/**
 * Every test of a Playwright JSON listing, files in path order and each
 * file's tests in declaration order.
 * @param {{suites?: object[]}} listing Playwright JSON reporter output (`--list`).
 * @returns {{file: string, titles: string[], line: number, column: number}[]}
 */
export function listedTests(listing) {
  const tests = [];
  const visit = (suite, titles, file) => {
    for (const spec of suite.specs ?? [])
      tests.push({
        file: spec.file ?? file,
        titles: [...titles, spec.title],
        line: spec.line ?? 0,
        column: spec.column ?? 0,
      });
    // An anonymous `test.describe(() => …)` adds no title, as in Playwright's
    // own title path, which a test list matches against.
    for (const child of suite.suites ?? [])
      visit(
        child,
        child.title ? [...titles, child.title] : titles,
        child.file ?? file,
      );
  };
  // A top-level suite is a file; its title is the file, not a title path.
  for (const suite of listing.suites ?? []) visit(suite, [], suite.file);
  return tests
    .filter(test => test.file)
    .sort(
      (a, b) =>
        a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column,
    );
}

/** The durations key of one test: its file and title path. */
export function testKey(test) {
  return [test.file, ...test.titles].join(DELIMITER);
}

/**
 * Whether a test-list line selects a test, as Playwright reads the list: an
 * optional `[project]`, the file, then a title path that is a prefix of the
 * test's, every token trimmed.
 */
export function lineSelects(line, test, project = PROJECT) {
  const tokens = line.split('\u203A').map(token => token.trim());
  if (tokens[0].startsWith('[')) {
    if (tokens.shift() !== `[${project}]`) return false;
  }
  const [file, ...titles] = tokens;
  if (file !== test.file) return false;
  return (
    titles.length <= test.titles.length &&
    titles.every((title, index) => test.titles[index] === title)
  );
}

/**
 * Whether a file's tests can each be named exactly in a test list: no title
 * carries the list's delimiter or edge spaces it would trim, no two tests
 * share a title path and none is a strict prefix of another's (one line would
 * select both), and the file does not run serially.
 */
export function canCut(tests, source = '') {
  if (/describe\.serial|mode:\s*['"]serial/.test(source)) return false;
  const paths = tests.map(test => test.titles);
  if (
    paths.some(titles =>
      // A line break would split the test-list line, so the test would run
      // in no leg.
      titles.some(
        title =>
          title.includes('\u203A') ||
          /[\r\n]/.test(title) ||
          title !== title.trim(),
      ),
    )
  )
    return false;
  const joined = new Set(paths.map(titles => titles.join('\n')));
  if (joined.size !== paths.length) return false;
  return !paths.some(titles =>
    titles
      .slice(0, -1)
      .some((_, end) => joined.has(titles.slice(0, end + 1).join('\n'))),
  );
}

/**
 * Splits the suite into `count` legs of whole files and consecutive parts of
 * long files.
 * @param {{file: string, titles: string[]}[]} tests every listed test, as listedTests orders them
 * @param {number} count legs
 * @param {{seconds?: Record<string, number>, tests?: Record<string, number>}} recorded
 * @param {(file: string) => string} [readSource] a spec file's source, to find serial files
 * @returns {{file: string, part: number, parts: number, tests: object[], seconds: number}[][]}
 */
export function partitionTests(tests, count, recorded, readSource = () => '') {
  const perTest = recorded.tests ?? {};
  const perFile = recorded.seconds ?? {};
  const byFile = new Map();
  for (const test of tests) {
    if (!byFile.has(test.file)) byFile.set(test.file, []);
    byFile.get(test.file).push(test);
  }
  const known = Object.values(perTest)
    .filter(value => value > 0)
    .sort((a, b) => a - b);
  const median = known.length > 0 ? known[Math.floor(known.length / 2)] : 1;
  const seconds = test => {
    if (perTest[testKey(test)] > 0) return perTest[testKey(test)];
    const file = perFile[test.file];
    return file > 0 ? file / byFile.get(test.file).length : median;
  };
  const total = tests.reduce((sum, test) => sum + seconds(test), 0);
  // One leg's fair share of one worker's time.
  const share = total / (count * WORKERS);

  const units = [];
  for (const [file, own] of byFile) {
    const fileSeconds = own.reduce((sum, test) => sum + seconds(test), 0);
    const parts = Math.min(count, Math.ceil(fileSeconds / share));
    if (parts <= 1 || !canCut(own, readSource(file))) {
      units.push({file, part: 1, parts: 1, tests: own, seconds: fileSeconds});
      continue;
    }
    const cut = [];
    let run = [];
    let runSeconds = 0;
    let done = 0;
    for (const [index, test] of own.entries()) {
      run.push(test);
      runSeconds += seconds(test);
      const left = own.length - index - 1;
      const target = ((cut.length + 1) * fileSeconds) / parts;
      if (cut.length < parts - 1 && left > 0 && done + runSeconds >= target) {
        cut.push({tests: run, seconds: runSeconds});
        done += runSeconds;
        run = [];
        runSeconds = 0;
      }
    }
    cut.push({tests: run, seconds: runSeconds});
    cut.forEach((piece, index) =>
      units.push({file, part: index + 1, parts: cut.length, ...piece}),
    );
  }

  const order = (a, b) => a.file.localeCompare(b.file) || a.part - b.part;
  const wall = leg => unitsWall(leg);
  // Parts of one file go to different legs: a leg runs a file on one worker.
  const fits = (leg, unit) => !leg.some(item => item.file === unit.file);
  const legs = Array.from({length: count}, () => []);
  for (const unit of [...units].sort(
    (a, b) => b.seconds - a.seconds || order(a, b),
  )) {
    const open = legs.filter(leg => fits(leg, unit));
    const lightest = open.reduce((best, leg) =>
      wall([...leg, unit]) < wall([...best, unit]) ? leg : best,
    );
    lightest.push(unit);
  }
  const worst = () => Math.max(...legs.map(wall));
  for (let improved = true; improved;) {
    improved = false;
    const best = worst();
    for (let from = 0; from < count && !improved; from += 1) {
      for (const unit of [...legs[from]].sort(order)) {
        for (let to = 0; to < count && !improved; to += 1) {
          if (to === from || !fits(legs[to], unit)) continue;
          legs[from] = legs[from].filter(item => item !== unit);
          legs[to].push(unit);
          if (worst() < best - 0.5) improved = true;
          else {
            legs[to] = legs[to].filter(item => item !== unit);
            legs[from].push(unit);
          }
        }
        if (improved) break;
      }
    }
  }
  const result = legs.map(leg => [...leg].sort(order));
  const lines = result.map(testListLines);
  for (const test of tests) {
    const selecting = lines.filter(leg =>
      leg.some(line => lineSelects(line, test)),
    ).length;
    if (selecting !== 1)
      throw new Error(
        `Contract shard partition selects ${testKey(test)} in ${selecting} legs.`,
      );
  }
  return result;
}

/** One leg's Playwright `--test-list` lines: whole files, or each test of a part. */
export function testListLines(leg) {
  return leg.flatMap(unit => {
    if (unit.parts === 1) return [`[${PROJECT}]${DELIMITER}${unit.file}`];
    return unit.tests.map(test =>
      [`[${PROJECT}]`, test.file, ...test.titles].join(DELIMITER),
    );
  });
}

/** Wall time of a leg's units in path order, each run by the first free worker. */
export function unitsWall(leg, workers = WORKERS) {
  const free = Array(workers).fill(0);
  for (const unit of [...leg].sort(
    (a, b) => a.file.localeCompare(b.file) || a.part - b.part,
  )) {
    const next = free.indexOf(Math.min(...free));
    free[next] += unit.seconds;
  }
  return Math.max(...free);
}

/** Seconds per test (by testKey) from Playwright list-reporter lines. */
export function recordTestDurations(text) {
  const seconds = {};
  for (const line of text.split('\n')) {
    const match =
      /[✓✘-]\s+\d+ \[chromium\] › ([^:]+):\d+:\d+ › (.*) \((\d+(?:\.\d+)?)(ms|s|m)\)\s*$/.exec(
        line,
      );
    if (!match) continue;
    const value = Number(match[3]) * {ms: 0.001, s: 1, m: 60}[match[4]];
    const key = [match[1], ...match[2].split(DELIMITER)].join(DELIMITER);
    seconds[key] = Math.round(((seconds[key] ?? 0) + value) * 10) / 10;
  }
  return seconds;
}

/** Seconds per file from Playwright list-reporter lines. */
export function recordDurations(text) {
  const seconds = {};
  for (const line of text.split('\n')) {
    const match =
      /[✓✘-]\s+\d+ \[chromium\] › ([^:]+):\d+:\d+ › .*\((\d+(?:\.\d+)?)(ms|s|m)\)\s*$/.exec(
        line,
      );
    if (!match) continue;
    const value = Number(match[2]) * {ms: 0.001, s: 1, m: 60}[match[3]];
    seconds[match[1]] =
      Math.round(((seconds[match[1]] ?? 0) + value) * 10) / 10;
  }
  return seconds;
}

function parseShard(value) {
  const match = /^(\d+)\/(\d+)$/.exec(value ?? '');
  const index = match ? Number(match[1]) : NaN;
  const count = match ? Number(match[2]) : NaN;
  if (
    !Number.isInteger(index) ||
    !Number.isInteger(count) ||
    index < 1 ||
    index > count
  ) {
    throw new Error(
      `--shard must be <index>/<count>, got ${value ?? 'nothing'}`,
    );
  }
  return {index, count};
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const args = process.argv.slice(2);
  if (args[0] === 'record') {
    const seconds = {};
    const tests = {};
    for (const file of args.slice(1)) {
      const text = fs.readFileSync(file, 'utf8');
      Object.assign(seconds, recordDurations(text));
      Object.assign(tests, recordTestDurations(text));
    }
    const current = JSON.parse(fs.readFileSync(DURATIONS, 'utf8'));
    const sorted = values =>
      Object.fromEntries(
        Object.entries(values).sort(([a], [b]) => a.localeCompare(b)),
      );
    fs.writeFileSync(
      DURATIONS,
      `${JSON.stringify({...current, source: 'recorded contract leg logs', seconds: sorted(seconds), tests: sorted(tests)}, null, 2)}\n`,
    );
  } else {
    const shard = parseShard(args[args.indexOf('--shard') + 1]);
    const listing = JSON.parse(
      execFileSync(
        'pnpm',
        ['-s', 'test:a11y-contract', '--list', '--reporter=json'],
        {
          cwd: ROOT,
          encoding: 'utf8',
          maxBuffer: 64 * 1024 * 1024,
          stdio: ['ignore', 'pipe', 'inherit'],
        },
      ),
    );
    const tests = listedTests(listing);
    if (tests.length === 0)
      throw new Error('The contract suite lists no tests.');
    const recorded = JSON.parse(fs.readFileSync(DURATIONS, 'utf8'));
    const legs = partitionTests(tests, shard.count, recorded, file =>
      fs.readFileSync(path.join(ROOT, file), 'utf8'),
    );
    const mine = legs[shard.index - 1];
    if (mine.length === 0)
      throw new Error(
        `Contract shard ${shard.index}/${shard.count} has no tests.`,
      );
    const count = mine.reduce((sum, unit) => sum + unit.tests.length, 0);
    const cut = mine.filter(unit => unit.parts > 1);
    console.error(
      `Contract shard ${shard.index}/${shard.count}: ${count} of ${tests.length} tests in ${mine.length} files or parts` +
        (cut.length > 0
          ? ` (${cut.map(unit => `${path.basename(unit.file)} part ${unit.part}/${unit.parts}`).join(', ')})`
          : '') +
        `; estimated ${Math.round(unitsWall(mine))} s on ${WORKERS} workers`,
    );
    process.stdout.write(`${testListLines(mine).join('\n')}\n`);
  }
}
