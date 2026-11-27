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

/**
 * A word that may ask for watch mode, or turn `--run` off: any long option
 * whose name starts with `w` (`--w`, `--watch=1`, `--watch.enabled`,
 * `--no-watch`), any short-flag group with `w` anywhere in it (`-w`, `-uw1`,
 * `-w0`), and `--run` with a value or negated (`--run=false`, `--no-run`).
 * The match is broad on purpose: a command line with one is not read as a
 * single run, whatever the value says, so a spelling it does not know leaves
 * Vitest its own count.
 */
const WATCH_WORD = /^(--(no-)?w|-[^-]*w|--(no-)?run[=.]|--no-run$)/i;

/**
 * Whether the command line is surely a single run: `run` or `list` as the
 * first word after the Vitest binary, or `--run` anywhere, and no word that
 * may ask for watch mode or turn `--run` off, and no `--` (Vitest reads no
 * option after it).
 * Anything else, a watch or a command line this cannot read, leaves Vitest
 * its own count.
 * @param {string[]} argv
 * @returns {boolean}
 */
function surelySingleRun(argv) {
  if (argv.includes('--')) return false;
  if (argv.some(arg => WATCH_WORD.test(arg))) return false;
  return argv[2] === 'run' || argv[2] === 'list' || argv.includes('--run');
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
 * - A watch, or a command line that is not surely a single run, keeps
 *   Vitest's default too: a watch is interactive, and an unknown command
 *   line gets no count rather than a wrong one.
 * - A single run on a shared machine is where a Node test file's own CLI
 *   processes load a many-core machine far past its cores under Vitest's
 *   default (one less than the cores): it starts one less than the cores,
 *   but at most 8 and at most one per 2 GiB of memory, and at least one.
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
  if (!surelySingleRun(argv)) return undefined;
  const byCores = cores - 1;
  const byMemory = Math.floor(memory / MEMORY_PER_WORKER);
  return Math.max(1, Math.min(byCores, MOST_WORKERS, byMemory));
}
