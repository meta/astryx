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
 *   count, so slow files can pile into one leg while other legs idle: on
 *   `main` one leg drew the slowest and the fifth-slowest file, 830 s of test
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
import {Worker} from 'node:worker_threads';
import {BaseSequencer} from 'vitest/node';
import {costOf, slowestFirst, splitByDuration} from './lib/duration-split.mjs';
import {
  fitSwizzleModel,
  sliceCost,
  swizzleSamples,
} from './lib/swizzle-cost.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DURATIONS = path.join(ROOT, 'scripts/vitest-node-durations.json');
const PROJECT = 'node';
// Seconds of import and transform per Node test file, as the legs report.
export const PER_FILE_SECONDS = 0.4;
// Seconds of summed file time a leg finishes per second of its run: test files
// run side by side (measured on main's six Node legs: 2.1 to 2.5).
export const LEG_PARALLELISM = 2.3;

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
  {legOneSeconds = 0, idle = new Set(), costs = new Map()} = {},
) {
  const recorded = costOf(files, seconds);
  // A file that runs no test in this run (the swizzle-proof slices when the
  // change reaches no component) costs only its import; a slice the change
  // reaches costs what its targets take (swizzleSliceCosts).
  const cost = file =>
    idle.has(file) ? 0 : (costs.get(file) ?? recorded(file));
  // Every file also costs its import and transform, which its recorded time
  // leaves out; without it the hundreds of files recorded at 0 s would all go
  // to one leg.
  return splitByDuration(
    files,
    count,
    file => cost(file) + PER_FILE_SECONDS,
    // The first leg's own steps take that much of its run, in file time.
    count > 1 ? [legOneSeconds * LEG_PARALLELISM] : [],
  );
}

/**
 * Seconds of the steps only the first leg runs (the record's legOneSteps), or
 * 0 when the record has none.
 */
export function readLegOneSeconds(file = DURATIONS) {
  try {
    const steps = JSON.parse(fs.readFileSync(file, 'utf8')).legOneSteps ?? {};
    return Object.values(steps).reduce((sum, s) => sum + (Number(s) || 0), 0);
  } catch {
    return 0;
  }
}

/**
 * Seconds per step of the first Node leg, from a job log as `gh run view
 * --log` prints it (job, step and a timestamp per line), for the step names
 * given.
 * @param {string} text
 * @param {string[]} names
 * @returns {Record<string, number>}
 */
export function recordLegOneSteps(text, names) {
  const wanted = new Set(names);
  /** @type {Map<string, [number, number]>} */
  const spans = new Map();
  for (const line of text.split('\n')) {
    const [job, step, rest] = line.split('\t');
    if (!/^test-node \(1\//.test(job ?? '') || !wanted.has(step)) continue;
    const at = Date.parse((rest ?? '').split(' ')[0]);
    if (!Number.isFinite(at)) continue;
    const span = spans.get(step) ?? [at, at];
    spans.set(step, [Math.min(span[0], at), Math.max(span[1], at)]);
  }
  return Object.fromEntries(
    [...spans].map(([step, [from, to]]) => [
      step,
      Math.round((to - from) / 1000),
    ]),
  );
}

/** The whole record, or an empty one when the file cannot be read. */
export function readRecord(file = DURATIONS) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

/** Recorded seconds per file, or none when the file cannot be read. */
export function readDurations(file = DURATIONS) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')).seconds ?? {};
  } catch {
    return {};
  }
}

/**
 * A Node leg's job name, as `gh run view --log` starts each of its lines: a
 * pull request's `test-node (2/5)` or a Main run's `test-node (2)`.
 */
const NODE_LEG_JOB = /^test-node \(\d+(?:\/\d+)?\)$/;

/**
 * Seconds per Node test file from Vitest's default reporter lines. A whole
 * run's log (`gh run view --log`) names each line's job in its first
 * tab-separated column: only the Node legs' lines count, since other jobs (the
 * build job runs its own `--project node` tests, which the Node legs skip)
 * would book time no leg spends. A single leg's own log has no job column.
 */
export function recordDurations(text) {
  const seconds = {};
  // Colour codes arrive as escape bytes, or, in `gh run view --log` output,
  // spelled out as `^[[…m`.
  const plain = text.replace(/(?:\x1b|\^\[)\[[0-9;]*m/g, '');
  for (const line of plain.split('\n')) {
    const columns = line.split('\t');
    if (columns.length >= 3 && !NODE_LEG_JOB.test(columns[0])) continue;
    const match =
      /[✓❯×]\s+\|?node\|?\s+(\S+\.(?:test|spec)\.[cm]?[jt]sx?)\s+\(\d+ tests?[^)]*\)\s+(\d+(?:\.\d+)?)(ms|s)\s*$/.exec(
        line,
      );
    if (match) {
      const value = Number(match[2]) / (match[3] === 'ms' ? 1000 : 1);
      seconds[match[1]] = Math.round(value * 10) / 10;
      continue;
    }
    // A file whose every test skips in the leg costs the leg nothing: it is
    // recorded at 0, so a time another job gave it never stays booked.
    const skipped =
      /↓\s+\|?node\|?\s+(\S+\.(?:test|spec)\.[cm]?[jt]sx?)\s+\((\d+) tests? \| (\d+) skipped\)/.exec(
        line,
      );
    if (skipped && skipped[2] === skipped[3]) seconds[skipped[1]] = 0;
  }
  return seconds;
}

const SWIZZLE_PROOF = /(^|\/)swizzle-proof\.\d+\.test\.mjs$/;

/**
 * The swizzle-proof slices among `files` that prove nothing in this run: every
 * slice reads the same scope first (packages/cli/test/swizzle-proof/proof.mjs
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
    pathToFileURL(path.join(ROOT, 'packages/cli/test/swizzle-proof/proof.mjs'))
      .href
  );
  const {scope} = runScope({all: process.env.SWIZZLE_PROOF_ALL === '1'});
  return new Set(scope.mode === 'none' ? slices : []);
}

/** How long the split waits for the affected targets once they are listed. */
export const BOUND_BUDGET_MS = 2000;
/** How long the split waits for the target list itself. */
const LIST_BUDGET_MS = 10_000;

/**
 * For each slice, how many of its targets the change can affect, from
 * swizzle-proof/bound-worker.mjs (the same functions the slices run), or
 * null when the worker fails or misses its time budget.
 * @param {string[]} relevant
 * @param {number} count slices
 * @param {{budgetMs?: number, listMs?: number}} [budget]
 * @returns {Promise<number[] | null>}
 */
export function boundWithin(
  relevant,
  count,
  {budgetMs = BOUND_BUDGET_MS, listMs = LIST_BUDGET_MS} = {},
) {
  return new Promise(resolve => {
    const worker = new Worker(
      path.join(ROOT, 'packages/cli/test/swizzle-proof/bound-worker.mjs'),
      {workerData: {relevant, count}},
    );
    let timer = setTimeout(() => finish(null), listMs);
    let done = false;
    const finish = result => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      void worker.terminate();
      resolve(result);
    };
    worker.on('message', message => {
      if (message.listed) {
        clearTimeout(timer);
        timer = setTimeout(() => finish(null), budgetMs);
      } else finish(message.held);
    });
    worker.on('error', () => finish(null));
    worker.on('exit', () => finish(null));
  });
}

/**
 * The swizzle-proof slices' cost in this run. In the scope `none` every slice
 * is idle. In the scope `affected` each slice costs what the record's model
 * gives for the targets it holds that the change can affect (the targets
 * come from the same proof.mjs functions the slices run). Every other case
 * keeps the slices' recorded time: the scope `all`, a record without the
 * model, and a bound that fails or misses its budget.
 * @param {string[]} files
 * @param {any} record the whole record (readRecord)
 * @param {{bound?: typeof boundWithin, plan?: () => {scope: {mode: string}, relevant: string[]}}} [inject]
 * @returns {Promise<{idle: Set<string>, costs: Map<string, number>}>}
 */
export async function swizzleSliceCosts(files, record, inject = {}) {
  const slices = files.filter(file => SWIZZLE_PROOF.test(file));
  const costs = new Map();
  if (slices.length === 0) return {idle: new Set(), costs};
  const plan =
    inject.plan ??
    (async () => {
      const {runScope} = await import(
        pathToFileURL(
          path.join(ROOT, 'packages/cli/test/swizzle-proof/proof.mjs'),
        ).href
      );
      return runScope({all: process.env.SWIZZLE_PROOF_ALL === '1'});
    });
  const {scope, relevant} = await plan();
  if (scope.mode === 'none') return {idle: new Set(slices), costs};
  const model = record?.swizzleProof;
  if (scope.mode !== 'affected' || !model) return {idle: new Set(), costs};
  const held = await (inject.bound ?? boundWithin)(relevant, slices.length);
  if (!held) return {idle: new Set(), costs};
  for (const file of slices) {
    const index = Number(/swizzle-proof\.(\d+)\.test\./.exec(file)?.[1]) - 1;
    if (!(index >= 0 && index < held.length)) return {idle: new Set(), costs};
    costs.set(file, sliceCost(model, held[index], record.seconds?.[file]));
  }
  return {idle: new Set(), costs};
}

/**
 * The record after a run. The run's times replace those files' times; files
 * the run did not reach keep their earlier times; a swizzle-proof slice keeps
 * the largest time seen; a file that no longer exists leaves the record.
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
  const merged = {...current};
  for (const [file, seconds] of Object.entries(recorded)) {
    merged[file] =
      SWIZZLE_PROOF.test(file) && typeof current[file] === 'number'
        ? Math.max(current[file], seconds)
        : seconds;
  }
  return Object.fromEntries(
    Object.entries(merged)
      .filter(([file]) => exists(file))
      .sort(([a], [b]) => a.localeCompare(b)),
  );
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
    const legOneSeconds =
      process.env.VITEST_LEG_ONE_RESERVE === '1' ? readLegOneSeconds() : 0;
    const files = node.map(relative);
    const record = readRecord();
    const {idle, costs} = await swizzleSliceCosts(files, record);
    const mine = new Set(
      partitionByDuration(files, count, record.seconds ?? {}, {
        legOneSeconds,
        idle,
        costs,
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
  // The first leg's own steps, from the same logs; a step the logs do not
  // show keeps its earlier time.
  const legOneSteps = {...(current.legOneSteps ?? {})};
  for (const log of logs)
    Object.assign(
      legOneSteps,
      recordLegOneSteps(fs.readFileSync(log, 'utf8'), Object.keys(legOneSteps)),
    );
  // The swizzle-proof slices' model, from their summary lines in the same
  // logs; a part the logs cannot show keeps its earlier value.
  const swizzleProof = fitSwizzleModel(
    logs.flatMap(log => swizzleSamples(fs.readFileSync(log, 'utf8'))),
    current.swizzleProof,
  );
  fs.writeFileSync(
    DURATIONS,
    `${JSON.stringify(
      {
        ...current,
        source: 'recorded Node leg logs',
        seconds: mergeRecord(current.seconds ?? {}, seconds),
        legOneSteps,
        ...(swizzleProof ? {swizzleProof} : {}),
      },
      null,
      2,
    )}\n`,
  );
  console.error(
    `Recorded ${Object.keys(seconds).length} Node test files in ${path.relative(ROOT, DURATIONS)}.`,
  );
}
