#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file playwright-legs.mjs
 * @description Splits the spec files of one Playwright suite into legs of
 *   about equal running time, from the per-file times a CI run recorded
 *   (spec:AST-030 FR13).
 * @input `plan`: the suite's times key, its config and project, this leg and
 *   the leg count, and any Playwright path filters;
 *   `.github/playwright-leg-durations.json`. `record`: CI job logs of the list
 *   reporter.
 * @output `plan`: this leg's spec files, one per line, for Playwright's
 *   `--test-list`, and `files=<count>` for `$GITHUB_OUTPUT`. `record`: the
 *   durations file, rewritten for the suite.
 * @position The pr-interaction, pr-interaction-webkit and docsite-browser
 *   legs in ci.yml.
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {costOf, splitByDuration} from '../../scripts/lib/duration-split.mjs';
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
export function recordLog(text, project, strip = '') {
  const seconds = {};
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
    previous = time;
  }
  return seconds;
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
  for (const log of logs) {
    for (const [file, value] of Object.entries(
      recordLog(fs.readFileSync(log, 'utf8'), project, strip),
    )) {
      seconds[file] = (seconds[file] ?? 0) + value;
    }
  }
  if (Object.keys(seconds).length === 0)
    throw new Error(`no ${key} test lines in the logs`);
  const durations = readDurations();
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
    if (command === 'plan') plan(args);
    else if (command === 'record') record(args);
    else throw new Error('usage: playwright-legs.mjs plan|record ...');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
