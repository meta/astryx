#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file interaction-legs.mjs
 * @description Splits the interaction proofs of one Playwright project into
 *   legs of about equal running time, by spec file, from the per-file times a
 *   CI run recorded (spec:AST-030 FR13).
 * @input `plan`: the project, this leg and the leg count, and any Playwright
 *   path filters; `.github/interaction-durations.json`. `record`: CI job logs
 *   of the list reporter.
 * @output `plan`: this leg's spec files, one per line, for Playwright's
 *   `--test-list`, and `files=<count>` for `$GITHUB_OUTPUT`. `record`: the
 *   durations file, rewritten for the project.
 * @position The pr-interaction and pr-interaction-webkit legs in ci.yml.
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
export const DURATIONS = path.join(ROOT, '.github/interaction-durations.json');
const CONFIG = 'playwright.interaction.config.ts';
// Seconds for a spec file with no recorded time and nothing to compare with.
const FALLBACK_SECONDS = 30;

/**
 * Splits `files` into `legs` lists of about equal estimated time: the longest
 * file first, each onto the leg with the least time so far (the lowest leg on
 * a tie). A file with no recorded time counts the median recorded time. Every
 * file lands in exactly one leg, and the same input always gives the same
 * split.
 */
export function planLegs(files, durations, legs) {
  if (!Number.isInteger(legs) || legs < 1)
    throw new Error(`legs must be a positive integer, got ${legs}`);
  const known = Object.values(durations ?? {})
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const median = known.length
    ? known[Math.floor(known.length / 2)]
    : FALLBACK_SECONDS;
  const estimate = file =>
    Number.isFinite(durations?.[file]) ? durations[file] : median;
  const unique = [...new Set(files)];
  const order = unique.sort(
    (a, b) => estimate(b) - estimate(a) || (a < b ? -1 : a > b ? 1 : 0),
  );
  const out = Array.from({length: legs}, () => ({files: [], seconds: 0}));
  for (const file of order) {
    let target = 0;
    for (let i = 1; i < legs; i += 1)
      if (out[i].seconds < out[target].seconds) target = i;
    out[target].files.push(file);
    out[target].seconds += estimate(file);
  }
  for (const leg of out) leg.files.sort();
  return out;
}

/** The spec files of a Playwright `--list --reporter=json` report. */
export function listedFiles(report) {
  const files = new Set();
  const walk = suite => {
    for (const child of suite.suites ?? []) walk(child);
    for (const spec of suite.specs ?? []) files.add(spec.file);
  };
  for (const suite of report.suites ?? []) walk(suite);
  return [...files].map(file => file.split(path.sep).join('/')).sort();
}

const TEST_LINE = /^(\S+Z)\s+\S+\s+\d+\s+\[([\w-]+)\] › ([^:]+):\d+:\d+ › /;
const RUNNING = /Running \d+ tests? using/;

/** Milliseconds of a log line's timestamp; GitHub writes seven fraction digits. */
function stamp(line) {
  return Date.parse(line.split(/\s/, 1)[0].replace(/(\.\d{3})\d*Z$/, '$1Z'));
}

/**
 * Seconds per spec file from a CI job log of the list reporter: each test's
 * time is the gap from the line before it, so a file's time includes its setup.
 */
export function recordLog(text, project) {
  const seconds = {};
  let previous = null;
  for (const line of text.split('\n')) {
    const at = stamp(line);
    if (previous == null && RUNNING.test(line) && Number.isFinite(at)) {
      previous = at;
      continue;
    }
    const match = TEST_LINE.exec(line);
    if (!match || previous == null || match[2] !== project) continue;
    const time = stamp(match[1]);
    seconds[match[3]] = (seconds[match[3]] ?? 0) + (time - previous) / 1000;
    previous = time;
  }
  return seconds;
}

function readDurations() {
  return fs.existsSync(DURATIONS)
    ? JSON.parse(fs.readFileSync(DURATIONS, 'utf8'))
    : {};
}

function option(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function plan(args) {
  const split = args.indexOf('--');
  const own = split === -1 ? args : args.slice(0, split);
  const filters = split === -1 ? [] : args.slice(split + 1);
  const project = option(own, '--project');
  const leg = Number(option(own, '--leg'));
  const legs = Number(option(own, '--of'));
  const out = option(own, '--out');
  if (!project || !out || !Number.isInteger(leg) || leg < 1 || leg > legs) {
    throw new Error(
      'usage: plan --project <name> --leg <i> --of <n> --out <file> [-- <filters...>]',
    );
  }
  // The report goes to a file: a spec's own logging can share stdout.
  const reportFile = `${out}.list.json`;
  execFileSync(
    'pnpm',
    [
      'exec',
      'playwright',
      'test',
      '--config',
      CONFIG,
      '--project',
      project,
      '--list',
      '--reporter=json',
      ...filters,
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
  const files = listedFiles(report);
  if (files.length === 0)
    throw new Error(`Playwright listed no ${project} interaction spec files`);
  const legsPlan = planLegs(files, readDurations()[project] ?? {}, legs);
  const mine = legsPlan[leg - 1];
  fs.writeFileSync(out, mine.files.map(file => `${file}\n`).join(''));
  console.log(
    `${project} leg ${leg}/${legs}: ${mine.files.length} of ${files.length} spec files, about ${Math.round(mine.seconds)} s`,
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
  const project = option(args, '--project');
  const logs = args.filter(
    (arg, i) => !arg.startsWith('--') && args[i - 1] !== '--project',
  );
  if (!project || logs.length === 0)
    throw new Error('usage: record --project <name> <job log...>');
  const seconds = {};
  for (const log of logs) {
    for (const [file, value] of Object.entries(
      recordLog(fs.readFileSync(log, 'utf8'), project),
    )) {
      seconds[file] = (seconds[file] ?? 0) + value;
    }
  }
  if (Object.keys(seconds).length === 0)
    throw new Error(`no ${project} test lines in the logs`);
  const durations = readDurations();
  durations[project] = Object.fromEntries(
    Object.entries(seconds)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([file, value]) => [file, Math.round(value * 10) / 10]),
  );
  fs.writeFileSync(DURATIONS, `${JSON.stringify(durations, null, 2)}\n`);
  console.log(
    `${project}: ${Object.keys(seconds).length} spec files recorded into ${path.relative(ROOT, DURATIONS)}`,
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
    else throw new Error('usage: interaction-legs.mjs plan|record ...');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
