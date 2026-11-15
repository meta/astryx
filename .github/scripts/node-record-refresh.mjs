#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Keeps the recorded Node test times fresh from `main`'s own runs. The
 * record (scripts/vitest-node-durations.json) only balances the Node legs: a
 * file with no recorded time is booked at the ninetieth percentile, so a stale
 * record never drops a file or breaks a leg's time budget. Pull requests
 * therefore never fail on it. This check runs on a schedule instead. When
 * fewer than MIN_RECORDED_SHARE of the Node project's test files have a
 * recorded time, the workflow regenerates the record from the Node legs of
 * main's latest successful full unit run, and this script opens or refreshes
 * the one pull request on BRANCH that carries it.
 *
 * @input `check`: the record and the Node project's tracked test files.
 *   `pr --run-url <url> --before <share>`: the regenerated record, and `gh`.
 * @output `check` prints the recorded share; with `--github-output` it also
 *   writes `fresh` and `share`. `pr` opens the pull request, or edits the one
 *   that is open.
 * @position .github/scripts — run by node-record-refresh.yml
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {nodeLegFiles, readDurations} from '../../scripts/vitest-node-legs.mjs';

/** The least share of Node test files the record must time: nine in ten. */
export const MIN_RECORDED_SHARE = 0.9;
/** The one branch, and so the one pull request, that carries a refresh. */
export const BRANCH = 'ci/node-durations-refresh';
export const TITLE = 'ci: refresh the recorded Node test times';

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

/** @param {number} share */
export function percent(share) {
  return `${Math.floor(share * 1000) / 10}%`;
}

/**
 * The body of the refresh pull request.
 * @param {{before: number, after: ReturnType<typeof coverage>, runUrl: string}} options
 */
export function prBody({before, after, runUrl}) {
  return `## Maintainer impact

The recorded Node test times covered ${percent(before)} of the Node project's test files, below the ${percent(MIN_RECORDED_SHARE)} bar. The Node legs book an unrecorded file at the ninetieth percentile, so this costs leg balance only.

## Intended invariant

The Node legs split by recorded time; which files run never depends on the record.

## Change

Regenerates \`scripts/vitest-node-durations.json\` from the Node legs of main's latest successful full unit run (${runUrl}) with \`node scripts/vitest-shard-sequencer.mjs record\`. Durations only.

## Evidence

- Failure before the change: ${percent(before)} of Node test files recorded.
- Success after the change: ${after.recorded} of ${after.total} recorded (${percent(after.share)}).
- Product/runtime behavior verified unchanged: only the record changes.
- CI impact (for a change to workflows, actions or CI scripts): none; the Node legs balance better.

## Scope

Components: none

- [x] No intended public API, product behavior, visual direction, or policy change.
- [x] Product changes discovered during the work were removed or split.
- [x] Public text and artifacts contain no internal Meta context.

## Testing

Opened by the scheduled Node record refresh. A later refresh updates this pull request instead of opening another.
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
  const now = coverage(nodeLegFiles(), readDurations());
  console.log(
    `${now.recorded} of ${now.total} Node test files have a recorded time (${percent(now.share)}; the bar is ${percent(MIN_RECORDED_SHARE)}).`,
  );
  if (command === 'check') {
    if (args.includes('--github-output') && process.env.GITHUB_OUTPUT)
      fs.appendFileSync(
        process.env.GITHUB_OUTPUT,
        `fresh=${now.fresh}\nshare=${now.share}\n`,
      );
    return 0;
  }
  const runUrl = option('--run-url');
  const before = Number(option('--before'));
  if (command !== 'pr' || !runUrl || !Number.isFinite(before)) {
    console.error(
      'usage: node-record-refresh.mjs check [--github-output] | pr --run-url <url> --before <share>',
    );
    return 2;
  }
  const gh = (/** @type {string[]} */ ghArgs) =>
    execFileSync('gh', ghArgs, {encoding: 'utf8'});
  const {action, url} = openOrRefresh(gh, {
    title: TITLE,
    body: prBody({before, after: now, runUrl}),
  });
  console.log(`${action === 'created' ? 'Opened' : 'Refreshed'} ${url}`);
  return 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = main(process.argv.slice(2));
}
