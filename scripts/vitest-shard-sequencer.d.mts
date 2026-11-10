// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file vitest-shard-sequencer.d.mts
 * @output Types for vitest-shard-sequencer.mjs, for vitest.config.ts, which
 *   imports it
 */

import type {BaseSequencer} from 'vitest/node';

export declare const DURATIONS: string;
export declare function partitionByDuration(
  files: string[],
  count: number,
  seconds: Record<string, number>,
): string[][];
export declare function readDurations(file?: string): Record<string, number>;
export declare function recordDurations(text: string): Record<string, number>;
declare const DurationShardSequencer: typeof BaseSequencer;
export default DurationShardSequencer;
