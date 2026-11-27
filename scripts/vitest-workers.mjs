// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How many Vitest workers a run uses on this machine.
 * @input The machine's cores and memory (os), or stubs for a test.
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
 * How many workers a run starts: one less than the cores (Vitest's own
 * default), but at most 8 and at most one per 2 GiB of memory, and at least
 * one. A Node test file can start CLI processes of its own, so on a machine
 * with many cores Vitest's default (cores − 1) loads it far past its cores.
 * A 4-core CI runner still runs 3.
 * @param {{cores?: number, memory?: number}} [machine]
 * @returns {number}
 */
export function testWorkers({
  cores = os.availableParallelism(),
  memory = os.totalmem(),
} = {}) {
  const byCores = cores - 1;
  const byMemory = Math.floor(memory / MEMORY_PER_WORKER);
  return Math.max(1, Math.min(byCores, MOST_WORKERS, byMemory));
}
