#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Keeps the recorded interaction spec times
 *   (`.github/playwright-leg-durations.json`) close to main, as the Node
 *   record's refresh does for the Node times.
 * @input `coverage --key <times key> [--github-summary]`: the record and the
 *   interaction spec files git tracks. `pr --run-url <url>...`: the
 *   regenerated record and `gh`.
 * @output `coverage` prints how many spec files the record times and, below
 *   nine in ten, an early warning (a workflow warning and a step summary
 *   line); it always exits 0. `pr` opens the refresh pull request, or edits
 *   the open one, so at most one is ever open.
 * @position interaction-record-refresh.yml, after it re-records the times from
 *   main's latest full Chromium and weekly WebKit runs with
 *   `playwright-legs.mjs record`.
 */
/* global console, process */
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {DURATIONS, isInteractionSpec} from './playwright-legs.mjs';

export const BRANCH = 'ci/interaction-durations-refresh';
export const TITLE = 'ci: refresh the recorded interaction test times';
/** Below this share of timed spec files, the refresh warns. */
export const MIN_TIMED_SHARE = 0.9;

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

/**
 * How many of the interaction spec files the record times under one key.
 * @param {string[]} specs
 * @param {Record<string, number>} recorded
 */
export function coverageOf(specs, recorded) {
  const timed = specs.filter(file => typeof recorded[file] === 'number').length;
  const share = specs.length ? timed / specs.length : 1;
  return {total: specs.length, timed, share, low: share < MIN_TIMED_SHARE};
}

/**
 * The early warning for a record that times too few spec files, or nothing.
 * @param {string} key
 * @param {ReturnType<typeof coverageOf>} coverage
 */
export function earlyWarning(key, {total, timed, share, low}) {
  if (!low) return '';
  return `Early warning: the ${key} record times ${timed} of ${total} interaction spec files (${Math.floor(share * 1000) / 10}%), under nine in ten. Each untimed spec is costed at the mean time a test, so its legs can run past the time they planned.`;
}

/**
 * The refresh pull request's body.
 * @param {{runs: string[], lines: string[]}} input
 */
export function prBody({runs, lines}) {
  return [
    '## What changes',
    '',
    'The recorded interaction spec times in `.github/playwright-leg-durations.json`, re-recorded with `node .github/scripts/playwright-legs.mjs record` from these full runs of `main`:',
    '',
    ...runs.map(url => `- ${url}`),
    '',
    'The legs split the suite by these times; which spec files run never depends on them.',
    '',
    '## Coverage',
    '',
    ...lines.map(line => `- ${line}`),
    '',
    'Opened by the interaction record refresh. A later refresh updates this pull request instead of opening another.',
  ].join('\n');
}

/**
 * Opens the refresh pull request, or edits the open one.
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

/** The interaction spec files git tracks. */
function trackedSpecs() {
  return execFileSync('git', ['ls-files'], {cwd: ROOT, encoding: 'utf8'})
    .split('\n')
    .filter(isInteractionSpec);
}

function coverageLine(key, durations, specs) {
  const coverage = coverageOf(specs, durations[key] ?? {});
  return {
    line: `${key}: ${coverage.timed} of ${coverage.total} spec files timed (${Math.floor(coverage.share * 1000) / 10}%)`,
    warning: earlyWarning(key, coverage),
  };
}

function main(args) {
  const [command] = args;
  const values = name =>
    args.flatMap((arg, i) => (arg === name ? [args[i + 1]] : []));
  const durations = JSON.parse(fs.readFileSync(DURATIONS, 'utf8'));
  const specs = trackedSpecs();
  if (command === 'coverage' && values('--key').length) {
    for (const key of values('--key')) {
      const {line, warning} = coverageLine(key, durations, specs);
      console.log(line);
      if (warning)
        console.log(`::warning title=Interaction record coverage::${warning}`);
      if (args.includes('--github-summary') && process.env.GITHUB_STEP_SUMMARY)
        fs.appendFileSync(
          process.env.GITHUB_STEP_SUMMARY,
          `${[line, warning].filter(Boolean).join('\n\n')}\n\n`,
        );
    }
    return;
  }
  if (command === 'pr' && values('--run-url').length) {
    const lines = ['interaction-chromium', 'interaction-webkit'].map(key => {
      const {line, warning} = coverageLine(key, durations, specs);
      return warning ? `${line}. ${warning}` : line;
    });
    const gh = ghArgs =>
      execFileSync('gh', ghArgs, {cwd: ROOT, encoding: 'utf8'});
    const {action, url} = openOrRefresh(gh, {
      title: TITLE,
      body: prBody({runs: values('--run-url'), lines}),
    });
    console.log(`${action === 'created' ? 'Opened' : 'Refreshed'} ${url}`);
    return;
  }
  throw new Error(
    'usage: interaction-record-refresh.mjs coverage --key <times key>... [--github-summary] | pr --run-url <url>...',
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
