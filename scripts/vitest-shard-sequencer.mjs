// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Which Node test files one `--shard <i>/<n>` leg runs.
 * @input The test specifications Vitest collected; `--shard`; recorded
 *   seconds per Node test file (scripts/vitest-node-durations.json, or the
 *   record `VITEST_DURATIONS_FILE` names, such as the minimum-Node legs').
 * @output The specifications this leg runs. With `record <log>…`, a fresh
 *   durations file (the same record) from Node leg logs.
 * @position `sequence.sequencer` in vitest.config.ts, so every `--shard` run,
 *   the Main workflow's legs and pull requests' alike, splits the `node` project
 *   this way. Vitest's own split deals files out by a hash of their path, by
 *   count, so slow files can pile into one leg while other legs idle: on
 *   `main` one leg drew the slowest and the fifth-slowest file, 830 s of test
 *   time against about 320 s for two other legs. This assigns every file to
 *   exactly one leg, slowest first, each to the leg with the least recorded
 *   time so far, so the slowest files each take a leg of their own and the
 *   slowest single file sets the floor (spec:AST-030 FR22). Within a leg it
 *   starts the slowest recorded file first, so that file never waits behind
 *   others. Each file costs what the Node leg planner
 *   (scripts/vitest-node-legs.mjs) books for it, so the legs it planned are
 *   the legs that run; a file with no recorded time counts as the ninetieth
 *   percentile (scripts/lib/duration-split.mjs). The numbers only steer
 *   balance; which files run never depends on them. Other projects keep
 *   Vitest's split and order.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {BaseSequencer} from 'vitest/node';
import {
  mergeRecord as mergeSeconds,
  slowestFirst,
  splitByDuration,
  SWIZZLE_PROOF,
} from './lib/duration-split.mjs';
import {
  DURATIONS,
  nodeFileCost,
  readDurations as readRecord,
} from './vitest-node-legs.mjs';

export {DURATIONS};

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The record this run reads and writes: `VITEST_DURATIONS_FILE` (relative to
 * the repository) when set, so a workflow on another Node version packs by
 * that version's times; else DURATIONS.
 */
export function durationsFile() {
  const other = process.env.VITEST_DURATIONS_FILE;
  return other ? path.resolve(ROOT, other) : DURATIONS;
}

/** Recorded seconds per file in the record this run reads, or none. */
export function readDurations(file = durationsFile()) {
  return readRecord(file);
}

const PROJECT = 'node';

/**
 * Splits files into `count` legs by recorded seconds.
 * @param {string[]} files repository-relative paths
 * @param {number} count legs
 * @param {Record<string, number>} seconds recorded seconds per file
 * @returns {string[][]} each leg's files, sorted; together exactly `files`
 */
export function partitionByDuration(
  files,
  count,
  seconds,
  {idle = new Set()} = {},
) {
  // A file that runs no test in this run (the swizzle-proof slices when the
  // change reaches no component) costs only its import.
  return splitByDuration(files, count, nodeFileCost(files, seconds, {idle}));
}

/**
 * A Node leg's job name, as `gh run view --log` starts each of its lines: a
 * pull request's `test-node (2/5)` or a Main run's `test-node (2)`.
 */
const NODE_LEG_JOB = /^test-node \(\d+(?:\/\d+)?\)$/;
/** A swizzle-proof leg's job name, such as `swizzle-proof (3/8)`. */
const SWIZZLE_PROOF_JOB = /^swizzle-proof \(\d+(?:\/\d+)?\)$/;

/**
 * A log's text without colour codes. They arrive as escape bytes, or, in
 * `gh run view --log` output, spelled out as `^[[…m`.
 */
export const plainLog = text => text.replace(/(?:\x1b|\^\[)\[[0-9;]*m/g, '');

/**
 * Each Node leg's lines in a whole run's log, by the job name each line
 * starts with (`test-node (2)`, `test-node (2/5)`).
 * @param {string} text
 * @returns {Map<string, string>}
 */
export function nodeLegLogs(text) {
  /** @type {Map<string, string[]>} */
  const legs = new Map();
  for (const line of text.split('\n')) {
    const job = line.split('\t')[0];
    if (!NODE_LEG_JOB.test(job)) continue;
    // Append in place: copying the leg's lines for each line is quadratic on
    // a whole run's log.
    const lines = legs.get(job);
    if (lines) lines.push(line);
    else legs.set(job, [line]);
  }
  return new Map([...legs].map(([job, lines]) => [job, lines.join('\n')]));
}

/**
 * How many test files a Vitest run counted, from its last `Test Files … (N)`
 * summary, or null when it printed none (a run that stopped early).
 * @param {string} text
 */
export function countedTestFiles(text) {
  const summary = plainLog(text)
    .match(/Test Files\s+[^\n]*\(\d+\)/g)
    ?.pop();
  return summary ? Number(/\((\d+)\)\s*$/.exec(summary)[1]) : null;
}

/**
 * Seconds per Node test file from Vitest's default reporter lines. A whole
 * run's log (`gh run view --log`) names each line's job in its first
 * tab-separated column: only the Node legs' lines count, since other jobs (the
 * build job runs its own `--project node` tests, which the Node legs skip)
 * would book time no leg spends. The swizzle-proof legs' lines count for the
 * slice files, which run there. A single leg's own log has no job column.
 * Every file a Node leg's reporter names gets an entry.
 */
export function recordDurations(text) {
  const seconds = {};
  for (const line of plainLog(text).split('\n')) {
    const columns = line.split('\t');
    if (columns.length >= 3 && !NODE_LEG_JOB.test(columns[0])) {
      if (!SWIZZLE_PROOF_JOB.test(columns[0])) continue;
      const file = /\s(\S+\.test\.mjs)\s/.exec(line)?.[1] ?? '';
      if (!SWIZZLE_PROOF.test(file)) continue;
    }
    const match =
      /[✓❯×]\s+\|?node\|?\s+(\S+\.(?:test|spec)\.[cm]?[jt]sx?)\s+\(\d+ tests?[^)]*\)\s+(\d+(?:\.\d+)?)(ms|s)\s*$/.exec(
        line,
      );
    if (match) {
      const value = Number(match[2]) / (match[3] === 'ms' ? 1000 : 1);
      seconds[match[1]] = Math.round(value * 10) / 10;
      continue;
    }
    // A file none of whose tests run in the leg (each skipped or todo) costs
    // the leg nothing: it is recorded at 0, so a time another job gave it
    // never stays booked.
    const idle =
      /↓\s+\|?node\|?\s+(\S+\.(?:test|spec)\.[cm]?[jt]sx?)\s+\((\d+) tests?((?: \| \d+ (?:skipped|todo))+)\)/.exec(
        line,
      );
    if (
      idle &&
      [...idle[3].matchAll(/(\d+) (?:skipped|todo)/g)].reduce(
        (sum, count) => sum + Number(count[1]),
        0,
      ) === Number(idle[2])
    )
      seconds[idle[1]] = 0;
  }
  return seconds;
}

/**
 * The swizzle-proof slices among `files` that prove nothing in this run: every
 * slice reads the same scope first (packages/cli/test/swizzle-proof/scope.mjs
 * runScope), and in the scope `none` it runs no target. Their recorded time is
 * the time they take when a change reaches them, so without this the legs that
 * hold them would finish early while the other legs carry the rest.
 * @param {string[]} files
 * @returns {Promise<Set<string>>}
 */
export async function idleSwizzleSlices(files) {
  const slices = files.filter(file => SWIZZLE_PROOF.test(file));
  if (slices.length === 0) return new Set();
  const {runScope} = await import(
    pathToFileURL(path.join(ROOT, 'packages/cli/test/swizzle-proof/scope.mjs'))
      .href
  );
  const {scope} = runScope({all: process.env.SWIZZLE_PROOF_ALL === '1'});
  return new Set(scope.mode === 'none' ? slices : []);
}

/**
 * The record after a run (duration-split.mjs `mergeRecord`), dropping a file
 * that no longer exists in the repository unless `exists` says otherwise.
 * @param {Record<string, number>} current
 * @param {Record<string, number>} recorded
 * @param {(file: string) => boolean} [exists]
 * @returns {Record<string, number>}
 */
export function mergeRecord(
  current,
  recorded,
  exists = file => fs.existsSync(path.join(ROOT, file)),
) {
  return mergeSeconds(current, recorded, exists);
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
    const files = node.map(relative);
    const mine = new Set(
      partitionByDuration(files, count, readDurations(), {
        idle: await idleSwizzleSlices(files),
      })[index - 1],
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
    const order = slowestFirst(files, nodeFileCost(files, readDurations()));
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
  const record = durationsFile();
  const current = fs.existsSync(record)
    ? JSON.parse(fs.readFileSync(record, 'utf8'))
    : {};
  fs.writeFileSync(
    record,
    `${JSON.stringify(
      {
        ...current,
        source: 'recorded Node leg logs',
        seconds: mergeRecord(current.seconds ?? {}, seconds),
      },
      null,
      2,
    )}\n`,
  );
  console.error(
    `Recorded ${Object.keys(seconds).length} Node test files in ${path.relative(ROOT, record)}.`,
  );
}
