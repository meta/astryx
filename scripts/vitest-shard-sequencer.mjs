// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Which Node test files one `--shard <i>/<n>` leg runs.
 * @input The test specifications Vitest collected; `--shard`; recorded
 *   seconds per Node test file (scripts/vitest-node-durations.json).
 * @output The specifications this leg runs. With `record <log>…`, a fresh
 *   durations file from Node leg logs.
 * @position `sequence.sequencer` in vitest.config.ts, so every `--shard` run,
 *   the Main workflow's legs and pull requests' alike, splits the `node` project
 *   this way. Vitest's own split deals files out by a hash of their path, by
 *   count, so two of the slowest files can land in one leg while other legs
 *   idle: on `main` one leg drew both of the two slowest files, 830 s of test
 *   time against about 320 s for two other legs. This assigns every file to
 *   exactly one leg, slowest first, each to the leg with the least recorded
 *   time so far, so the slowest files each take a leg of their own and the
 *   slowest single file sets the floor (spec:AST-030 FR22). Within a leg it
 *   starts the slowest recorded file first, so that file never waits behind
 *   others. A file with no recorded time counts as the median
 *   (scripts/lib/duration-split.mjs). The numbers only steer balance; which
 *   files run never depends on them. Other projects keep Vitest's split and
 *   order.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {BaseSequencer} from 'vitest/node';
import {costOf, slowestFirst, splitByDuration} from './lib/duration-split.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DURATIONS = path.join(ROOT, 'scripts/vitest-node-durations.json');
const PROJECT = 'node';
// Seconds of import and transform per Node test file, as the legs report.
export const PER_FILE_SECONDS = 0.4;

/**
 * Splits files into `count` legs by recorded seconds.
 * @param {string[]} files repository-relative paths
 * @param {number} count legs
 * @param {Record<string, number>} seconds recorded seconds per file
 * @returns {string[][]} each leg's files, sorted; together exactly `files`
 */
export function partitionByDuration(files, count, seconds) {
  const cost = costOf(files, seconds);
  // Every file also costs its import and transform, which its recorded time
  // leaves out; without it the hundreds of files recorded at 0 s would all go
  // to one leg.
  return splitByDuration(files, count, file => cost(file) + PER_FILE_SECONDS);
}

/** Recorded seconds per file, or none when the file cannot be read. */
export function readDurations(file = DURATIONS) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')).seconds ?? {};
  } catch {
    return {};
  }
}

/** Seconds per Node test file from Vitest's default reporter lines. */
export function recordDurations(text) {
  const seconds = {};
  for (const line of text.replace(/\x1b\[[0-9;]*m/g, '').split('\n')) {
    const match =
      /[✓❯×]\s+\|?node\|?\s+(\S+\.(?:test|spec)\.[cm]?[jt]sx?)\s+\(\d+ tests?[^)]*\)\s+(\d+(?:\.\d+)?)(ms|s)\s*$/.exec(
        line,
      );
    if (!match) continue;
    const value = Number(match[2]) / (match[3] === 'ms' ? 1000 : 1);
    seconds[match[1]] = Math.round(value * 10) / 10;
  }
  return seconds;
}

export default class DurationShardSequencer extends BaseSequencer {
  relative(spec) {
    return path
      .relative(this.ctx.config.root, spec.moduleId)
      .split(path.sep)
      .join('/');
  }

  async shard(specs) {
    const {index, count} = this.ctx.config.shard;
    const relative = spec => this.relative(spec);
    const node = specs.filter(spec => spec.project.name === PROJECT);
    const others = specs.filter(spec => spec.project.name !== PROJECT);
    const mine = new Set(
      partitionByDuration(node.map(relative), count, readDurations())[
        index - 1
      ],
    );
    return [
      ...node.filter(spec => mine.has(relative(spec))),
      ...(others.length > 0 ? await super.shard(others) : []),
    ];
  }

  // Vitest orders files by its results cache, which a fresh CI checkout does
  // not have, so it falls back to file size. Node files start slowest recorded
  // first instead, in the places Vitest gave `node` files; the rest keep
  // Vitest's order.
  async sort(specs) {
    const sorted = await super.sort(specs);
    const slots = [];
    const node = [];
    sorted.forEach((spec, position) => {
      if (spec.project.name !== PROJECT) return;
      slots.push(position);
      node.push(spec);
    });
    const byPath = new Map(node.map(spec => [this.relative(spec), spec]));
    // One spec per file is the rule; anything else keeps Vitest's order.
    if (byPath.size !== node.length) return sorted;
    const files = [...byPath.keys()];
    const order = slowestFirst(files, costOf(files, readDurations()));
    const result = [...sorted];
    order.forEach((file, i) => {
      result[slots[i]] = byPath.get(file);
    });
    return result;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [command, ...logs] = process.argv.slice(2);
  if (command !== 'record' || logs.length === 0) {
    console.error(
      'usage: node scripts/vitest-shard-sequencer.mjs record <Node leg log>…',
    );
    process.exit(2);
  }
  const seconds = {};
  for (const log of logs)
    Object.assign(seconds, recordDurations(fs.readFileSync(log, 'utf8')));
  if (Object.keys(seconds).length === 0) {
    console.error('No Node test file times found in those logs.');
    process.exit(1);
  }
  const current = fs.existsSync(DURATIONS)
    ? JSON.parse(fs.readFileSync(DURATIONS, 'utf8'))
    : {};
  fs.writeFileSync(
    DURATIONS,
    `${JSON.stringify(
      {
        ...current,
        source: 'recorded Node leg logs',
        seconds: Object.fromEntries(
          Object.entries(seconds).sort(([a], [b]) => a.localeCompare(b)),
        ),
      },
      null,
      2,
    )}\n`,
  );
  console.error(
    `Recorded ${Object.keys(seconds).length} Node test files in ${path.relative(ROOT, DURATIONS)}.`,
  );
}
