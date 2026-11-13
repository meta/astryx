#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Fails a Node leg when a test file the pull request changes now runs
 * far past its recorded time, so the record is brought up to date by the pull
 * request that slows the file, before a later pull request's leg runs over
 * its job limit.
 *
 * The legs balance by `scripts/vitest-node-durations.json`. A file that ran
 * more than RATIO times its recorded seconds and more than MARGIN_S seconds
 * over fails, naming both times and the command that regenerates the record.
 * Only files the change touches count, so a slow runner alone fails no one;
 * a file with no recorded time counts as the median and is not checked.
 *
 * @input --times <file> (the shard watchdog's per-file seconds),
 *   --changed <base> (the merge commit's first parent)
 * @output exit 1 and one error line per drifted file; exit 0 otherwise
 * @position .github/scripts — run by ci.yml's Node legs after their tests
 */

import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

export const RATIO = 1.5;
export const MARGIN_S = 60;
const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const RECORD = 'scripts/vitest-node-durations.json';

/**
 * The changed test files whose measured time is past their record.
 * @param {Record<string, number>} measured seconds per test file, this leg
 * @param {Record<string, number>} recorded seconds per test file, the record
 * @param {string[]} changed the files the change touches
 * @returns {{file: string, recorded: number, measured: number}[]}
 */
export function drifted(measured, recorded, changed) {
  const touched = new Set(changed);
  return Object.entries(measured)
    .filter(([file]) => touched.has(file) && typeof recorded[file] === 'number')
    .filter(
      ([file, seconds]) =>
        seconds > recorded[file] * RATIO && seconds - recorded[file] > MARGIN_S,
    )
    .map(([file, seconds]) => ({
      file,
      recorded: recorded[file],
      measured: seconds,
    }))
    .sort((a, b) => b.measured - b.recorded - (a.measured - a.recorded));
}

function main(args) {
  const option = name => args[args.indexOf(name) + 1];
  const timesFile = option('--times');
  const base = option('--changed');
  if (!timesFile || !base) {
    console.error('usage: node-time-drift.mjs --times <file> --changed <base>');
    return 2;
  }
  if (!fs.existsSync(timesFile)) {
    console.log(
      `No per-file times at ${timesFile}: the leg ran no Node test file.`,
    );
    return 0;
  }
  const measured = JSON.parse(fs.readFileSync(timesFile, 'utf8'));
  const recorded = JSON.parse(
    fs.readFileSync(path.join(ROOT, RECORD), 'utf8'),
  ).seconds;
  const changed = execFileSync(
    'git',
    ['-C', ROOT, 'diff', '--name-only', base, 'HEAD'],
    {
      encoding: 'utf8',
    },
  )
    .split('\n')
    .filter(Boolean);
  const late = drifted(measured, recorded, changed);
  for (const {file, recorded: before, measured: now} of late) {
    console.log(
      `::error file=${file},title=Recorded Node test time is stale::${file} ran ${now} s; ${RECORD} records ${before} s. This change touches the file, so update the record from this run (record merges: other files keep their times): gh run view <this run> --repo meta/astryx --log > run.log && node scripts/vitest-shard-sequencer.mjs record run.log`,
    );
  }
  if (late.length === 0)
    console.log('The changed Node test files run within their recorded times.');
  return late.length ? 1 : 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = main(process.argv.slice(2));
}
