// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How many Vitest workers a run uses on this machine.
 * @input The machine's cores and memory (os, and the process's memory limit
 *   in a container), the CI variable and the command line, or stubs for a
 *   test.
 * @output `testWorkers()`, the root `test.maxWorkers` in vitest.config.ts.
 * @position vitest.config.ts reads it for every project. It reads CI with
 *   the CLI's own rule (packages/cli/foundation/release/update-notice-env.mjs).
 */

import os from 'node:os';
import {isCi} from '../packages/cli/foundation/release/update-notice-env.mjs';

/** The most workers a run starts on a shared machine. */
export const MOST_WORKERS = 8;

/** The memory each worker gets: a CLI test can run Node children beside it. */
export const MEMORY_PER_WORKER = 2 * 1024 ** 3;

/** A command-line worker count, in either spelling Vitest accepts. */
const WORKERS_FLAG = /^--max-?workers(=|$)/i;

/** A watch flag, which keeps `vitest run` watching. */
const WATCH_FLAG = /^(--watch(=true)?|-w)$/;

/**
 * Whether the command line makes a single run: `--run` anywhere, `list` as
 * the first word after the Vitest binary, or `run` there without a watch
 * flag (Vitest keeps `vitest run --watch` watching). The same words as a
 * file filter or a test-name pattern, or after an option, do not count.
 * Reading a single run as a watch only lowers the count.
 * @param {string[]} argv
 * @returns {boolean}
 */
function singleRun(argv) {
  if (argv.includes('--run')) return true;
  if (argv[2] === 'list') return true;
  return argv[2] === 'run' && !argv.some(arg => WATCH_FLAG.test(arg));
}

/**
 * The memory the run can use: the machine's, or the container's limit when
 * it is lower.
 * @returns {number}
 */
function usableMemory() {
  const total = os.totalmem();
  const limit = process.constrainedMemory?.() ?? 0;
  return limit > 0 ? Math.min(total, limit) : total;
}

/**
 * How many workers a run starts, or no value to leave Vitest its own count.
 * - A command line that names a worker count keeps it: Vitest gives that
 *   flag to the root only, and projects that extend the root would otherwise
 *   carry this value instead.
 * - A CI runner is a machine the run has to itself, so it keeps Vitest's
 *   default (one less than the cores).
 * - Elsewhere the machine is shared, and a Node test file can start CLI
 *   processes of its own, so Vitest's default loads a many-core machine far
 *   past its cores: the run starts Vitest's default (one less than the
 *   cores, or half of them in watch mode), but at most 8 and at most one per
 *   2 GiB of memory, and at least one.
 * @param {{cores?: number, memory?: number, env?: Record<string, string | undefined>, argv?: string[]}} [machine]
 * @returns {number | undefined}
 */
export function testWorkers({
  cores = os.availableParallelism(),
  memory = usableMemory(),
  env = process.env,
  argv = process.argv,
} = {}) {
  if (argv.some(arg => WORKERS_FLAG.test(arg))) return undefined;
  if (isCi(env)) return undefined;
  const watch = !singleRun(argv);
  const byCores = watch ? Math.floor(cores / 2) : cores - 1;
  const byMemory = Math.floor(memory / MEMORY_PER_WORKER);
  return Math.max(1, Math.min(byCores, MOST_WORKERS, byMemory));
}
