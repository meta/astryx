#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Keeps the recorded Node test times fresh from `main`'s own runs. The
 * record (scripts/vitest-node-durations.json) balances the Node legs: a file
 * with no recorded time is booked at the ninetieth percentile, so a missing
 * entry never drops a file, but a missing or low entry costs leg balance and
 * can make a leg run long until the next refresh. A contributor cannot produce
 * a CI-comparable time, so no pull request fails on the record. Instead, after
 * each full unit run of `main`, this compares the record with that run's
 * measured times. When fewer than MIN_RECORDED_SHARE of the Node project's
 * test files have a recorded time, or a recorded file ran far past its entry,
 * the workflow regenerates the record from that run's Node legs with each
 * leg's slowdown taken out (`regenerate`), and this script opens or refreshes
 * the one pull request on BRANCH that carries it.
 *
 * @input `warn`: the record and the Node project's tracked test files.
 *   `regenerate --log <run log>`: a Main run's log and the record.
 *   `check --log <run log> --reasons <file>`: a Main run's Node leg
 *   logs, each line led by its leg's name (the workflow's read step), the record and the Node project's tracked test
 *   files. `pr --run-url <url> --reasons <file>`: the regenerated record, the
 *   check's reasons, and `gh`.
 * @output `warn` prints the early warning and adds it to the step summary;
 *   it always exits 0. `regenerate` rewrites the record's new and far-off
 *   entries. `check` writes the reasons, prints them and adds the
 *   warning to the step summary; with `--github-output`
 *   it also writes `refresh`. It fails when a leg's log misses test files. `pr` opens the pull request, or edits the one
 *   that is open.
 * @position .github/scripts — run by node-record-refresh.yml
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {mergeRecord} from '../../scripts/lib/duration-split.mjs';
import {nodeLegFiles, readDurations} from '../../scripts/vitest-node-legs.mjs';
import {
  countedTestFiles,
  durationsFile,
  nodeLegLogs,
  recordDurations,
} from '../../scripts/vitest-shard-sequencer.mjs';
import {MARGIN_S, RATIO, drifted, legFactor} from './node-time-drift.mjs';

/**
 * The least share of Node test files the record must time: nineteen in
 * twenty. Past one file in twenty without a time, main's run warns and the
 * refresh opens, long before leg balance suffers; nothing ever fails on it.
 */
export const MIN_RECORDED_SHARE = 0.95;
/** How many of the heaviest unrecorded files a warning names. */
export const HEAVIEST_SHOWN = 10;
/**
 * Seconds past its expected time a recorded file must also run before main's
 * run re-records it: the pull-request drift notice's own margin, so the files
 * that notice names are the files a refresh corrects.
 */
export const DRIFT_MARGIN_S = MARGIN_S;
/** The one branch, and so the one pull request, that carries a refresh. */
export const BRANCH = 'ci/node-durations-refresh';
export const TITLE = 'ci: refresh the recorded Node test times';

/**
 * Seconds a regenerated time must differ from its entry, as well as RATIO
 * times either way, before it replaces the entry: smaller moves are noise
 * between runs.
 */
export const RETIME_MIN_S = 5;

const ROOT = path.resolve(import.meta.dirname, '../..');

/**
 * How much of the Node project the record times.
 * @param {string[]} nodeFiles the Node project's test files
 * @param {Record<string, number>} recorded seconds per file
 * @param {{minShare?: number}} [options] the least share that is fresh (this
 *   record's bar by default)
 * @returns {{total: number, recorded: number, share: number, missing: string[], fresh: boolean}}
 */
export function coverage(
  nodeFiles,
  recorded,
  {minShare = MIN_RECORDED_SHARE} = {},
) {
  const missing = nodeFiles.filter(file => typeof recorded[file] !== 'number');
  const total = nodeFiles.length;
  const share = total === 0 ? 1 : (total - missing.length) / total;
  return {
    total,
    recorded: total - missing.length,
    share,
    missing,
    fresh: share >= minShare,
  };
}

/**
 * The recorded files that ran far past their entry in a Main run, by the
 * pull-request drift rule (node-time-drift.mjs `drifted`) with every file
 * judged. Each leg's slowdown is taken out separately, as on a pull request,
 * since the legs run on different runners.
 * @param {string} log a Main run's log
 * @param {Record<string, number>} recorded
 * @returns {{file: string, recorded: number, measured: number}[]}
 */
export function driftedEntries(log, recorded) {
  return [...nodeLegLogs(log).values()]
    .flatMap(text =>
      drifted(recordDurations(text), recorded, [], {
        all: true,
        margin: DRIFT_MARGIN_S,
      }),
    )
    .map(({file, recorded: before, measured}) => ({
      file,
      recorded: before,
      measured,
    }))
    .sort((a, b) => a.file.localeCompare(b.file));
}

/**
 * The heaviest of the record's missing files by the time each took in a Main
 * run's Node legs, as measured.
 * @param {string} log a Main run's log
 * @param {string[]} missing
 * @returns {{file: string, measured: number}[]}
 */
export function heaviestUnrecorded(log, missing) {
  const lacking = new Set(missing);
  // One parse of the Node legs' lines: a long log holds more lines than a
  // call can take as arguments.
  const measured = recordDurations([...nodeLegLogs(log).values()].join('\n'));
  return Object.entries(measured)
    .filter(([file]) => lacking.has(file))
    .map(([file, seconds]) => ({file, measured: seconds}))
    .sort((a, b) => b.measured - a.measured || a.file.localeCompare(b.file))
    .slice(0, HEAVIEST_SHOWN);
}

/**
 * The early warning for a record that times too few Node test files, or
 * nothing when it times enough.
 * @param {{total: number, recorded: number, share: number, fresh: boolean}} covered
 * @param {{file: string, measured: number}[]} [heaviest]
 * @returns {string}
 */
export function earlyWarning(covered, heaviest = []) {
  if (covered.fresh) return '';
  const missing = covered.total - covered.recorded;
  const lines = [
    `Early warning: ${missing} of ${covered.total} Node test files (${percent(missing / covered.total)}) have no recorded time, past the ${Math.round((1 - MIN_RECORDED_SHARE) * 100)}% line. Leg balance books each at the ninetieth percentile until the record is refreshed; nothing fails on it.`,
  ];
  if (heaviest.length > 0)
    lines.push(
      '',
      `The heaviest unrecorded files in main's run:`,
      ...heaviest.map(({file, measured}) => `- \`${file}\`: ${measured} s`),
    );
  return lines.join('\n');
}

/**
 * The entries a Main run's Node legs give the record. Each leg's times are
 * divided by that leg's own slowdown (node-time-drift.mjs `legFactor`: the
 * median measured ÷ recorded over its recorded files, never below 1), so a
 * slow runner does not raise the record. A file the record lacks takes its
 * time. A recorded file takes it only when it is RATIO times off its entry,
 * either way, and at least RETIME_MIN_S seconds away; a lower time is taken
 * only after that division. Every other entry keeps its value.
 * @param {string} log a Main run's log
 * @param {Record<string, number>} recorded
 * @returns {{seconds: Record<string, number>, legs: {files: number, factor: number}[]}}
 */
export function normalizedTimes(log, recorded) {
  /** @type {Record<string, number>} */
  const seconds = {};
  const legs = [...nodeLegLogs(log).values()].map(leg => {
    const measured = recordDurations(leg);
    const {factor} = legFactor(measured, recorded, new Set());
    for (const [file, raw] of Object.entries(measured)) {
      const time = Math.round((raw / factor) * 10) / 10;
      const before = recorded[file];
      const farOff =
        typeof before === 'number' &&
        Math.abs(time - before) >= RETIME_MIN_S &&
        (time >= before * RATIO || time * RATIO <= before);
      if (typeof before !== 'number' || farOff) seconds[file] = time;
    }
    return {files: Object.keys(measured).length, factor};
  });
  return {seconds, legs};
}

/**
 * The Node legs whose log does not time every test file Vitest counted:
 * fewer files than its `Test Files` summary, or no summary (a leg that
 * crashed). A log that stops early (a reader that drops a long line and all
 * that follows) would keep older times for the rest of the leg.
 * @param {string} log a Main run's log
 * @returns {{job: string, read: number, counted: number | null}[]}
 */
export function incompleteLegs(log) {
  return [...nodeLegLogs(log)]
    .map(([job, text]) => ({
      job,
      read: Object.keys(recordDurations(text)).length,
      counted: countedTestFiles(text),
    }))
    .filter(({read, counted}) => counted == null || read < counted)
    .sort((a, b) => a.job.localeCompare(b.job, 'en', {numeric: true}));
}

/**
 * Why the record needs a refresh after a Main run, if it does.
 * @param {{nodeFiles: string[], recorded: Record<string, number>, log: string}} input
 */
export function refreshReasons({nodeFiles, recorded, log}) {
  const {
    total,
    recorded: timed,
    share,
    fresh,
    missing,
  } = coverage(nodeFiles, recorded);
  const late = driftedEntries(log, recorded);
  return {
    coverage: {total, recorded: timed, share, fresh},
    unrecorded: fresh ? [] : heaviestUnrecorded(log, missing),
    drifted: late,
    refresh: !fresh || late.length > 0,
  };
}

/** @param {number} share */
export function percent(share) {
  return `${Math.floor(share * 1000) / 10}%`;
}

/**
 * The body of the refresh pull request.
 * @param {{reasons: ReturnType<typeof refreshReasons>, after: ReturnType<typeof coverage>, runUrl: string}} options
 */
export function prBody({reasons, after, runUrl}) {
  const before = reasons.coverage;
  const why = [
    ...(before.fresh
      ? []
      : [
          `- The record timed ${before.recorded} of ${before.total} Node test files (${percent(before.share)}), below the ${percent(MIN_RECORDED_SHARE)} bar.`,
          '',
          earlyWarning(before, reasons.unrecorded ?? []),
          '',
        ]),
    ...(reasons.drifted.length > 0 && !before.fresh
      ? ["Recorded files that ran far past their entry in main's run:", '']
      : []),
    ...reasons.drifted.map(
      ({file, recorded, measured}) =>
        `- \`${file}\` ran ${measured} s against its recorded ${recorded} s.`,
    ),
  ].join('\n');
  return `## Maintainer impact

The Node legs balance by the recorded test times. A missing or low entry costs leg balance and can make a leg run long until the record is refreshed. In main's run:

${why}

## Intended invariant

The Node legs split by recorded time; which files run never depends on the record.

## Change

Regenerates \`scripts/vitest-node-durations.json\` from the Node legs of main's full unit run (${runUrl}). Each leg's times are divided by that leg's slowdown (the median measured ÷ recorded time over its recorded files, never below 1). A file the record lacks takes its time; a recorded file takes it only when it is ${RATIO} times off its entry, either way, and at least ${RETIME_MIN_S} s away. Durations only.

## Evidence

- Failure before the change: the entries above.
- Success after the change: ${after.recorded} of ${after.total} Node test files recorded (${percent(after.share)}); new and far-off files take that run's time, every other entry keeps its own.
- Product/runtime behavior verified unchanged: only the record changes.
- CI impact (for a change to workflows, actions or CI scripts): none; the Node legs balance better.

## Scope

Components: none

- [x] No intended public API, product behavior, visual direction, or policy change.
- [x] Product changes discovered during the work were removed or split.
- [x] Public text and artifacts contain no internal Meta context.

## Testing

Opened by the Node record refresh after a full unit run of main. A later refresh updates this pull request instead of opening another.
`;
}

/**
 * Opens the refresh pull request, or edits the open one, so at most one is
 * ever open.
 * @param {(args: string[]) => string} gh runs `gh` and returns its stdout
 * @param {{title: string, body: string, branch?: string}} pr `branch` is
 *   the refresh's fixed head branch (this record's by default).
 * @returns {{action: 'created' | 'refreshed', url: string}}
 */
export function openOrRefresh(gh, {title, body, branch = BRANCH}) {
  const open = JSON.parse(
    gh([
      'pr',
      'list',
      '--head',
      branch,
      '--base',
      'main',
      '--state',
      'open',
      '--json',
      'number,url',
    ]) || '[]',
  );
  if (open.length > 0) {
    const [{number, url}] = open;
    gh(['pr', 'edit', String(number), '--title', title, '--body', body]);
    return {action: 'refreshed', url};
  }
  const url = gh([
    'pr',
    'create',
    '--base',
    'main',
    '--head',
    branch,
    '--title',
    title,
    '--body',
    body,
  ]).trim();
  return {action: 'created', url};
}

/** @param {string[]} args */
function main(args) {
  const [command] = args;
  const option = (/** @type {string} */ name) =>
    args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
  const reasonsFile = option('--reasons');
  if (command === 'check' && option('--log') && reasonsFile) {
    const log = fs.readFileSync(
      /** @type {string} */ (option('--log')),
      'utf8',
    );
    if (nodeLegLogs(log).size === 0) {
      console.error(
        '::error title=No Node leg logs::The run log has no Node leg lines, so no record is written.',
      );
      return 1;
    }
    const short = incompleteLegs(log);
    if (short.length > 0) {
      console.error(
        `::error title=Incomplete Node leg logs::These legs' logs miss test files their Vitest summary counts, so no record is written:\n${short.map(({job, read, counted}) => `  ${job}: ${read} files read, ${counted == null ? 'no Test Files summary' : `${counted} counted`}`).join('\n')}`,
      );
      return 1;
    }
    const reasons = refreshReasons({
      nodeFiles: nodeLegFiles(),
      recorded: readDurations(),
      log,
    });
    fs.writeFileSync(reasonsFile, `${JSON.stringify(reasons, null, 2)}\n`);
    const {recorded, total, share} = reasons.coverage;
    console.log(
      `${recorded} of ${total} Node test files have a recorded time (${percent(share)}; the bar is ${percent(MIN_RECORDED_SHARE)}).`,
    );
    console.log(
      reasons.drifted.length
        ? `Recorded files far past their entry in this run:\n${reasons.drifted.map(({file, recorded: before, measured}) => `  ${file}: ${measured} s, recorded ${before} s`).join('\n')}`
        : 'No recorded file ran far past its entry in this run.',
    );
    const warning = earlyWarning(reasons.coverage, reasons.unrecorded);
    if (warning && process.env.GITHUB_STEP_SUMMARY)
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${warning}\n`);
    if (args.includes('--github-output') && process.env.GITHUB_OUTPUT)
      fs.appendFileSync(
        process.env.GITHUB_OUTPUT,
        `refresh=${reasons.refresh}\n`,
      );
    return 0;
  }
  if (command === 'warn') {
    // An early warning on main's own run: it never fails, so the exit code is
    // 0 whatever the record holds.
    const warning = earlyWarning(
      coverage(nodeLegFiles(), readDurations(durationsFile())),
    );
    if (warning) {
      console.log(`::warning title=Node test record::${warning}`);
      if (process.env.GITHUB_STEP_SUMMARY)
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${warning}\n`);
    } else console.log('The Node test record times enough files.');
    return 0;
  }
  if (command === 'regenerate' && option('--log')) {
    const file = durationsFile();
    const record = JSON.parse(fs.readFileSync(file, 'utf8'));
    const current = record.seconds ?? {};
    const {seconds, legs} = normalizedTimes(
      fs.readFileSync(/** @type {string} */ (option('--log')), 'utf8'),
      current,
    );
    // A log with no Node leg time is not a run to record from: fail, as the
    // recorder does, so a refresh that is due never ends green without one.
    if (legs.every(({files}) => files === 0)) {
      console.error('No Node test file times found in that log.');
      return 1;
    }
    record.seconds = mergeRecord(current, seconds, each =>
      fs.existsSync(path.join(ROOT, each)),
    );
    fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
    // What the merge actually changed: it keeps a swizzle-proof slice's
    // largest time, so a lower one is not a change.
    const changed = Object.keys(record.seconds).filter(
      each => record.seconds[each] !== current[each],
    );
    const added = changed.filter(each => !(each in current));
    console.log(
      `Recorded ${added.length} new Node test files and re-timed ${changed.length - added.length}; leg slowdowns ${legs.map(({factor}) => factor.toFixed(2)).join(', ')}.`,
    );
    return 0;
  }
  const runUrl = option('--run-url');
  if (command === 'pr' && runUrl && reasonsFile) {
    const gh = (/** @type {string[]} */ ghArgs) =>
      execFileSync('gh', ghArgs, {encoding: 'utf8'});
    const {action, url} = openOrRefresh(gh, {
      title: TITLE,
      body: prBody({
        reasons: JSON.parse(fs.readFileSync(reasonsFile, 'utf8')),
        after: coverage(nodeLegFiles(), readDurations()),
        runUrl,
      }),
    });
    console.log(`${action === 'created' ? 'Opened' : 'Refreshed'} ${url}`);
    return 0;
  }
  console.error(
    'usage: node-record-refresh.mjs warn | regenerate --log <run log> | check --log <run log> --reasons <file> [--github-output] | pr --run-url <url> --reasons <file>',
  );
  return 2;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = main(process.argv.slice(2));
}
