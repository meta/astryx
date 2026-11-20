#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Notes, on a Node leg, each test file the pull request changes that now
 * runs far past its recorded time or has no recorded time, so the author can
 * bring the record up to date. It never fails the leg: a contributor cannot
 * produce a CI-comparable time, and after each full unit run of `main` a job
 * regenerates the record from that run's Node legs when an entry is missing
 * or has drifted by this same rule (node-record-refresh.mjs). Until then a
 * missing or low entry costs leg balance and can make a leg run long.
 *
 * The legs balance by `scripts/vitest-node-durations.json`. A loaded runner
 * slows every file, so a file is compared with its own leg: the leg factor is
 * the median of measured ÷ recorded over the files the change does not touch,
 * never below 1, so a fast runner does not tighten the bar. With fewer than
 * MIN_PEERS such files there is no baseline in the leg: the factor is 1, and
 * the output says so. A changed file is noted when it ran
 * more than RATIO times its record × the leg factor, and more than MARGIN_S
 * seconds over that. A changed file with no recorded time under its own path
 * is noted when it ran more than NEW_FILE_S × the leg factor. That includes a
 * renamed file, whose old entry the note asks to move. Each note names the one
 * entry to add, move or update.
 *
 * @input --times <file> (the shard watchdog's per-file seconds),
 *   --changed <base> (the merge commit's first parent)
 * @output one notice line per drifted or unrecorded file; always exit 0 once
 *   the arguments are valid. `drifted` also judges every file, with a margin,
 *   for a scheduled run.
 * @position .github/scripts — run by ci.yml's Node legs after their tests;
 *   cli-minimum-node.mjs imports `drifted` for the minimum-Node legs
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
 * leg's own slowdown is taken out. With `all`, every measured file is judged,
 * and the leg's slowdown is read from every file (a scheduled run has no
 * change to set apart).
 * @param {Record<string, number>} measured seconds per test file, this leg
 * @param {Record<string, number>} recorded seconds per test file, the record
 * @param {string[]} changed the files the change touches
 * @param {{all?: boolean, margin?: number}} [options] `margin`: seconds past
 *   the expected time a file must also run (MARGIN_S by default)
 * @returns {{file: string, recorded: number, measured: number, factor: number, suggested: number}[]}
 */
export function drifted(
  measured,
  recorded,
  changed,
  {all = false, margin = MARGIN_S} = {},
) {
  const touched = new Set(changed);
  const {factor} = legFactor(measured, recorded, all ? new Set() : touched);
  return Object.entries(measured)
    .filter(
      ([file]) =>
        (all || touched.has(file)) && typeof recorded[file] === 'number',
    )
    .filter(([file, seconds]) => {
      const expected = recorded[file] * factor;
      return seconds > expected * RATIO && seconds - expected > margin;
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
 * Changed test files with no recorded time under their own path that ran more
 * than NEW_FILE_S × the leg factor. A renamed file whose old path has a record
 * names that path as `from`, so the entry can move.
 * @param {Record<string, number>} measured
 * @param {Record<string, number>} recorded
 * @param {string[]} changed
 * @param {Array<[string, string]>} [renames] [old, new] paths
 */
export function unrecorded(measured, recorded, changed, renames = []) {
  const touched = new Set(changed);
  const fromOf = new Map(renames.map(([from, to]) => [to, from]));
  const {factor} = legFactor(measured, recorded, touched);
  return Object.entries(measured)
    .filter(
      ([file, seconds]) =>
        touched.has(file) &&
        typeof recorded[file] !== 'number' &&
        seconds > NEW_FILE_S * factor,
    )
    .map(([file, seconds]) => {
      const from = fromOf.get(file);
      return {
        file,
        measured: seconds,
        factor: Math.round(factor * 100) / 100,
        suggested: Math.round((seconds / factor) * 10) / 10,
        ...(from && typeof recorded[from] === 'number'
          ? {from, fromRecorded: recorded[from]}
          : {}),
      };
    })
    .sort((a, b) => b.measured - a.measured);
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

/**
 * The notice lines for one leg: the baseline note, then one line per changed
 * file past its record or with no record. Notices never fail the leg.
 * @param {Record<string, number>} measured seconds per test file, this leg
 * @param {Record<string, number>} recorded seconds per test file, the record
 * @param {string[]} changed
 * @param {Array<[string, string]>} [renames]
 * @returns {string[]}
 */
export function notices(measured, recorded, changed, renames = []) {
  const lines = [];
  const leg = legFactor(measured, recorded, new Set(changed));
  if (!leg.baseline)
    lines.push(
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
    lines.push(
      `::notice file=${file},title=Recorded Node test time is stale::${file} ran ${now} s; ${RECORD} records ${before} s, and ${legSays}. This change touches the file, so you may set only its entry in ${RECORD}: "${file}": ${suggested} (${value}). Leave every other entry as it is.`,
    );
  }
  const unseen = unrecorded(measured, recorded, changed, renames);
  const legSentence = `${legSays[0].toUpperCase()}${legSays.slice(1)}`;
  for (const {file, measured: now, suggested, from, fromRecorded} of unseen) {
    const fix = from
      ? `It was renamed from ${from} (recorded at ${fromRecorded} s), so you may move that entry: replace "${from}" with "${file}": ${suggested} (${value}).`
      : `You may add only its entry to ${RECORD}: "${file}": ${suggested} (${value}).`;
    lines.push(
      `::notice file=${file},title=Node test file has no recorded time::test file ${file} ran ${now} s and has no recorded time under that path. ${legSentence}; the legs' split looks the record up by path, so it books this file at the ninetieth percentile of the recorded times. ${fix}`,
    );
  }
  if (late.length === 0 && unseen.length === 0)
    lines.push('The changed Node test files run within their recorded times.');
  return lines;
}

/**
 * @param {string[]} args
 * @param {{diff?: (base: string) => string}} [io] `git diff --name-status -M <base> HEAD`
 * @returns {number} 2 for bad arguments; else 0, whatever the notices say
 */
export function main(
  args,
  {
    diff = base =>
      execFileSync(
        'git',
        ['-C', ROOT, 'diff', '--name-status', '-M', base, 'HEAD'],
        {encoding: 'utf8'},
      ),
  } = {},
) {
  const option = (/** @type {string} */ name) =>
    args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
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
  const {changed, renames} = parseNameStatus(diff(base));
  const recorded = JSON.parse(
    fs.readFileSync(path.join(ROOT, RECORD), 'utf8'),
  ).seconds;
  for (const line of notices(measured, recorded, changed, renames))
    console.log(line);
  return 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = main(process.argv.slice(2));
}
