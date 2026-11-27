// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How many Vitest workers a run uses on this machine.
 * @input The machine's cores and memory (os) and the CI variable, or stubs
 *   for a test.
 * @output `testWorkers()`, the root `test.maxWorkers` in vitest.config.ts.
 * @position vitest.config.ts reads it for every project. A `--maxWorkers`
 *   flag, or the VITEST_MAX_WORKERS environment variable, still overrides
 *   it. No dependencies.
 */

import os from 'node:os';

/** The most workers a run starts, on any machine. */
export const MOST_WORKERS = 8;

/** The memory each worker gets: a CLI test can run Node children beside it. */
export const MEMORY_PER_WORKER = 2 * 1024 ** 3;

/**
 * Whether the CI variable marks this run as a CI runner's: set, and not
 * empty, "0" or "false".
 * @param {string | undefined} value
 * @returns {boolean}
 */
function isCi(value) {
  return value !== undefined && !['', '0', 'false'].includes(value.trim());
}

/**
 * How many workers a run starts. A CI runner is a machine the run has to
 * itself, so it keeps Vitest's own default (one less than the cores): no
 * value. Elsewhere the machine is shared, and a Node test file can start CLI
 * processes of its own, so Vitest's default loads a many-core machine far
 * past its cores: the run starts one less than the cores, but at most 8 and
 * at most one per 2 GiB of memory, and at least one.
 * @param {{cores?: number, memory?: number, env?: Record<string, string | undefined>}} [machine]
 * @returns {number | undefined}
 */
export function testWorkers({
  cores = os.availableParallelism(),
  memory = os.totalmem(),
  env = process.env,
} = {}) {
  if (isCi(env.CI)) return undefined;
  const byCores = cores - 1;
  const byMemory = Math.floor(memory / MEMORY_PER_WORKER);
  return Math.max(1, Math.min(byCores, MOST_WORKERS, byMemory));
}
