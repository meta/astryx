// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file vitest-workers.d.mts
 * @output Types for vitest-workers.mjs, for vitest.config.ts, which imports
 *   it
 */

export declare const MOST_WORKERS: number;
export declare const MEMORY_PER_WORKER: number;
export declare function testWorkers(machine?: {
  cores?: number;
  memory?: number;
  env?: Record<string, string | undefined>;
  argv?: string[];
}): number | undefined;
