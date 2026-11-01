#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Which accessibility contract spec files one release shard runs.
 * @input `--shard <i>/<n>`; the contract suite as `playwright test --list`
 *   reports it; recorded seconds per file (.github/a11y-contract-durations.json).
 * @output One file filter per line for `pnpm test:a11y-contract`; with
 *   `record <log>…`, a fresh durations file from contract leg logs.
 * @position The a11y-contracts-shard legs in ci.yml. Playwright's own `--shard`
 *   splits files in path order by test count, but per-test cost differs by
 *   orders of magnitude (fixture checks take milliseconds, binding states
 *   seconds), so one leg idled while another ran three times as long. This
 *   assigns every listed file to exactly one leg, choosing the split that
 *   finishes soonest when each leg runs its files in path order on its
 *   workers, using the recorded seconds (a file with none counts as the
 *   median; scripts/lib/duration-split.mjs, shared with the Node legs). The
 *   numbers only steer balance; coverage never depends on them.
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {
  assertEachOnce,
  costOf,
  splitByDuration,
} from '../../scripts/lib/duration-split.mjs';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const DURATIONS = path.join(ROOT, '.github/a11y-contract-durations.json');
const WORKERS = 4;

/** @param {{suites?: object[]}} listing Playwright JSON reporter output (`--list`). */
export function listedFiles(listing) {
  const files = new Set();
  const visit = suite => {
    for (const spec of suite.specs ?? []) files.add(spec.file ?? suite.file);
    for (const child of suite.suites ?? []) visit(child);
  };
  for (const suite of listing.suites ?? []) visit(suite);
  return [...files].filter(Boolean).sort();
}

/** Wall time of files run in path order, each by the first free worker. */
export function legWall(files, seconds, workers = WORKERS) {
  const free = Array(workers).fill(0);
  for (const file of [...files].sort()) {
    const next = free.indexOf(Math.min(...free));
    free[next] += seconds(file);
  }
  return Math.max(...free);
}

/**
 * @param {string[]} files every listed file
 * @param {number} count legs
 * @param {Record<string, number>} recorded seconds per file
 * @returns {string[][]} each leg's files in path order; together exactly `files`
 */
export function partitionFiles(files, count, recorded) {
  const seconds = costOf(files, recorded);
  // Longest first to the lightest leg, then improve by moving single files.
  const legs = splitByDuration(files, count, seconds);
  const worst = () => Math.max(...legs.map(leg => legWall(leg, seconds)));
  for (let improved = true; improved;) {
    improved = false;
    let best = worst();
    for (let from = 0; from < count && !improved; from += 1) {
      for (const file of [...legs[from]].sort()) {
        for (let to = 0; to < count && !improved; to += 1) {
          if (to === from) continue;
          legs[from] = legs[from].filter(item => item !== file);
          legs[to].push(file);
          const candidate = worst();
          if (candidate < best - 0.5) {
            best = candidate;
            improved = true;
          } else {
            legs[to] = legs[to].filter(item => item !== file);
            legs[from].push(file);
          }
        }
        if (improved) break;
      }
    }
  }
  const result = legs.map(leg => [...leg].sort());
  assertEachOnce(files, result, 'file');
  return result;
}

/** A Playwright file filter matching exactly this repository-relative path. */
export function fileFilter(file) {
  return `/${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`;
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
    for (const file of args.slice(1))
      Object.assign(seconds, recordDurations(fs.readFileSync(file, 'utf8')));
    const current = JSON.parse(fs.readFileSync(DURATIONS, 'utf8'));
    const sorted = Object.fromEntries(
      Object.entries(seconds).sort(([a], [b]) => a.localeCompare(b)),
    );
    fs.writeFileSync(
      DURATIONS,
      `${JSON.stringify({...current, source: 'recorded contract leg logs', seconds: sorted}, null, 2)}\n`,
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
    const files = listedFiles(listing);
    if (files.length === 0)
      throw new Error('The contract suite lists no spec files.');
    const {seconds} = JSON.parse(fs.readFileSync(DURATIONS, 'utf8'));
    const mine = partitionFiles(files, shard.count, seconds)[shard.index - 1];
    if (mine.length === 0)
      throw new Error(
        `Contract shard ${shard.index}/${shard.count} has no files.`,
      );
    console.error(
      `Contract shard ${shard.index}/${shard.count}: ${mine.length} of ${files.length} files`,
    );
    process.stdout.write(`${mine.map(fileFilter).join('\n')}\n`);
  }
}
