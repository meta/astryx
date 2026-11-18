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
 * the workflow regenerates the record from that run's Node legs, and this
 * script opens or refreshes the one pull request on BRANCH that carries it.
 *
 * @input `check --log <run log> --reasons <file>`: a Main run's log
 *   (`gh run view --log`), the record and the Node project's tracked test
 *   files. `pr --run-url <url> --reasons <file>`: the regenerated record, the
 *   check's reasons, and `gh`.
 * @output `check` writes the reasons and prints them; with `--github-output`
 *   it also writes `refresh`. `pr` opens the pull request, or edits the one
 *   that is open.
 * @position .github/scripts — run by node-record-refresh.yml
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {nodeLegFiles, readDurations} from '../../scripts/vitest-node-legs.mjs';
import {recordDurations} from '../../scripts/vitest-shard-sequencer.mjs';
import {MARGIN_S, drifted} from './node-time-drift.mjs';

/** The least share of Node test files the record must time: nine in ten. */
export const MIN_RECORDED_SHARE = 0.9;
/**
 * Seconds past its expected time a recorded file must also run before main's
 * run re-records it: the pull-request drift notice's own margin, so the files
 * that notice names are the files a refresh corrects.
 */
export const DRIFT_MARGIN_S = MARGIN_S;
/** The one branch, and so the one pull request, that carries a refresh. */
export const BRANCH = 'ci/node-durations-refresh';
export const TITLE = 'ci: refresh the recorded Node test times';

/** A Main run's Node leg, as its log names each line's job. */
const NODE_LEG_JOB = /^test-node \(\d+\)$/;

/**
 * How much of the Node project the record times.
 * @param {string[]} nodeFiles the Node project's test files
 * @param {Record<string, number>} recorded seconds per file
 * @returns {{total: number, recorded: number, share: number, missing: string[], fresh: boolean}}
 */
export function coverage(nodeFiles, recorded) {
  const missing = nodeFiles.filter(file => typeof recorded[file] !== 'number');
  const total = nodeFiles.length;
  const share = total === 0 ? 1 : (total - missing.length) / total;
  return {
    total,
    recorded: total - missing.length,
    share,
    missing,
    fresh: share >= MIN_RECORDED_SHARE,
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
  /** @type {Map<string, string[]>} */
  const legs = new Map();
  for (const line of log.split('\n')) {
    const job = line.split('\t')[0];
    if (NODE_LEG_JOB.test(job)) legs.set(job, [...(legs.get(job) ?? []), line]);
  }
  return [...legs.values()]
    .flatMap(lines =>
      drifted(recordDurations(lines.join('\n')), recorded, [], {
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
 * Why the record needs a refresh after a Main run, if it does.
 * @param {{nodeFiles: string[], recorded: Record<string, number>, log: string}} input
 */
export function refreshReasons({nodeFiles, recorded, log}) {
  const {total, recorded: timed, share, fresh} = coverage(nodeFiles, recorded);
  const late = driftedEntries(log, recorded);
  return {
    coverage: {total, recorded: timed, share, fresh},
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
        ]),
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

Regenerates \`scripts/vitest-node-durations.json\` from the Node legs of main's full unit run (${runUrl}) with \`node scripts/vitest-shard-sequencer.mjs record\`. Durations only.

## Evidence

- Failure before the change: the entries above.
- Success after the change: ${after.recorded} of ${after.total} Node test files recorded (${percent(after.share)}); every measured file takes that run's time.
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
 * @param {{title: string, body: string}} pr
 * @returns {{action: 'created' | 'refreshed', url: string}}
 */
export function openOrRefresh(gh, {title, body}) {
  const open = JSON.parse(
    gh([
      'pr',
      'list',
      '--head',
      BRANCH,
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
    BRANCH,
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
    const reasons = refreshReasons({
      nodeFiles: nodeLegFiles(),
      recorded: readDurations(),
      log: fs.readFileSync(/** @type {string} */ (option('--log')), 'utf8'),
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
    if (args.includes('--github-output') && process.env.GITHUB_OUTPUT)
      fs.appendFileSync(
        process.env.GITHUB_OUTPUT,
        `refresh=${reasons.refresh}\n`,
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
    'usage: node-record-refresh.mjs check --log <run log> --reasons <file> [--github-output] | pr --run-url <url> --reasons <file>',
  );
  return 2;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = main(process.argv.slice(2));
}
