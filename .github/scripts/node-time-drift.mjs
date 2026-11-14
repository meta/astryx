#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Fails a Node leg when a test file the pull request changes now runs
 * far past its recorded time, so the record is brought up to date by the pull
 * request that slows the file, before a later pull request's leg runs over
 * its job limit.
 *
 * The legs balance by `scripts/vitest-node-durations.json`. A loaded runner
 * slows every file, so a file is compared with its own leg: the leg factor is
 * the median of measured ÷ recorded over the files the change does not touch,
 * never below 1, so a fast runner does not tighten the bar. With fewer than
 * MIN_PEERS such files there is no baseline in the leg: the factor is 1, and
 * the output says so. A changed file fails when it ran
 * more than RATIO times its record × the leg factor, and more than MARGIN_S
 * seconds over that. A changed file with no recorded time (new, or renamed
 * from a name with no record) fails when it ran more than NEW_FILE_S × the leg
 * factor: the legs' split counts it as the median until it is recorded. A
 * rename carries the old name's record. Each failure names the one entry to
 * add or update and its value.
 *
 * @input --times <file> (the shard watchdog's per-file seconds),
 *   --changed <base> (the merge commit's first parent)
 * @output exit 1 and one error line per drifted or unrecorded file; exit 0
 *   otherwise
 * @position .github/scripts — run by ci.yml's Node legs after their tests
 */

import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

export const RATIO = 1.5;
export const MARGIN_S = 60;
export const MIN_PEERS = 5;
export const NEW_FILE_S = 60;
const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const RECORD = 'scripts/vitest-node-durations.json';

/** @param {number[]} values */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * How much slower than its record this leg ran: the median measured ÷
 * recorded over the files the change does not touch, never below 1. With
 * fewer than MIN_PEERS such files there is no baseline, and the factor is 1.
 * @param {Record<string, number>} measured
 * @param {Record<string, number>} recorded
 * @param {Set<string>} touched
 * @returns {{factor: number, peers: number, baseline: boolean, median?: number}}
 */
export function legFactor(measured, recorded, touched) {
  const ratios = Object.entries(measured)
    .filter(([file]) => !touched.has(file) && recorded[file] > 0)
    .map(([file, seconds]) => seconds / recorded[file]);
  const baseline = ratios.length >= MIN_PEERS;
  const measuredMedian = baseline ? median(ratios) : undefined;
  return {
    factor: baseline ? Math.max(1, /** @type {number} */ (measuredMedian)) : 1,
    peers: ratios.length,
    baseline,
    median: measuredMedian,
  };
}

/**
 * The changed test files whose measured time is past their record, after the
 * leg's own slowdown is taken out.
 * @param {Record<string, number>} measured seconds per test file, this leg
 * @param {Record<string, number>} recorded seconds per test file, the record
 * @param {string[]} changed the files the change touches
 * @returns {{file: string, recorded: number, measured: number, factor: number, suggested: number}[]}
 */
export function drifted(measured, recorded, changed) {
  const touched = new Set(changed);
  const {factor} = legFactor(measured, recorded, touched);
  return Object.entries(measured)
    .filter(([file]) => touched.has(file) && typeof recorded[file] === 'number')
    .filter(([file, seconds]) => {
      const expected = recorded[file] * factor;
      return seconds > expected * RATIO && seconds - expected > MARGIN_S;
    })
    .map(([file, seconds]) => ({
      file,
      recorded: recorded[file],
      measured: seconds,
      factor: Math.round(factor * 100) / 100,
      suggested: Math.round((seconds / factor) * 10) / 10,
    }))
    .sort((a, b) => b.measured - b.recorded - (a.measured - a.recorded));
}

/**
 * Changed test files with no recorded time that ran more than NEW_FILE_S × the
 * leg factor.
 * @param {Record<string, number>} measured
 * @param {Record<string, number>} recorded
 * @param {string[]} changed
 */
export function unrecorded(measured, recorded, changed) {
  const touched = new Set(changed);
  const {factor} = legFactor(measured, recorded, touched);
  return Object.entries(measured)
    .filter(
      ([file, seconds]) =>
        touched.has(file) &&
        typeof recorded[file] !== 'number' &&
        seconds > NEW_FILE_S * factor,
    )
    .map(([file, seconds]) => ({
      file,
      measured: seconds,
      factor: Math.round(factor * 100) / 100,
      suggested: Math.round((seconds / factor) * 10) / 10,
    }))
    .sort((a, b) => b.measured - a.measured);
}

/**
 * The record as this change sees it: a renamed file keeps its old name's
 * recorded time, so a rename is never a new, unrecorded file.
 * @param {Record<string, number>} recorded
 * @param {Array<[string, string]>} renames [old, new] paths
 */
export function withRenames(recorded, renames) {
  const view = {...recorded};
  for (const [from, to] of renames)
    if (typeof view[to] !== 'number' && typeof recorded[from] === 'number')
      view[to] = recorded[from];
  return view;
}

/**
 * Changed paths and renames from `git diff --name-status -M`.
 * @param {string} text
 * @returns {{changed: string[], renames: Array<[string, string]>}}
 */
export function parseNameStatus(text) {
  const changed = [];
  /** @type {Array<[string, string]>} */
  const renames = [];
  for (const line of text.split('\n').filter(Boolean)) {
    const [status, ...paths] = line.split('\t');
    if (status.startsWith('R') && paths.length === 2) {
      renames.push([paths[0], paths[1]]);
      changed.push(paths[1]);
    } else if (paths.length) changed.push(paths[paths.length - 1]);
  }
  return {changed, renames};
}

/** @param {string[]} args */
function main(args) {
  const option = (/** @type {string} */ name) => args[args.indexOf(name) + 1];
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
  const {changed, renames} = parseNameStatus(
    execFileSync(
      'git',
      ['-C', ROOT, 'diff', '--name-status', '-M', base, 'HEAD'],
      {encoding: 'utf8'},
    ),
  );
  const recorded = withRenames(
    JSON.parse(fs.readFileSync(path.join(ROOT, RECORD), 'utf8')).seconds,
    renames,
  );
  const leg = legFactor(measured, recorded, new Set(changed));
  if (!leg.baseline)
    console.log(
      `No baseline in this leg: ${leg.peers} unchanged test file(s) with a recorded time, fewer than ${MIN_PEERS}, so the leg factor is 1 and changed files are judged against their recorded times as they are.`,
    );
  const late = drifted(measured, recorded, changed);
  const legSays = !leg.baseline
    ? 'this leg has no baseline, so its factor is 1'
    : /** @type {number} */ (leg.median) < 1
      ? `this leg ran ${Math.round(/** @type {number} */ (leg.median) * 100) / 100}× its record overall, counted as 1`
      : `this leg ran ${Math.round(leg.factor * 100) / 100}× its record overall`;
  const value =
    leg.factor > 1
      ? "its time with the leg's slowdown taken out"
      : 'its measured time';
  for (const {file, recorded: before, measured: now, suggested} of late) {
    console.log(
      `::error file=${file},title=Recorded Node test time is stale::${file} ran ${now} s; ${RECORD} records ${before} s, and ${legSays}. This change touches the file, so set only its entry in ${RECORD}: "${file}": ${suggested} (${value}). Leave every other entry as it is.`,
    );
  }
  const unseen = unrecorded(measured, recorded, changed);
  for (const {file, measured: now, suggested} of unseen) {
    console.log(
      `::error file=${file},title=New Node test file has no recorded time::new test file ${file} ran ${now} s and has no recorded time: run record. ${legSays[0].toUpperCase()}${legSays.slice(1)}; the legs' split counts this file as the median until it is recorded. Add only its entry to ${RECORD}: "${file}": ${suggested} (${value}).`,
    );
  }
  if (late.length === 0 && unseen.length === 0)
    console.log('The changed Node test files run within their recorded times.');
  return late.length || unseen.length ? 1 : 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = main(process.argv.slice(2));
}
