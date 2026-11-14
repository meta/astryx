// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file vitest-shard-sequencer.d.mts
 * @output Types for vitest-shard-sequencer.mjs, for vitest.config.ts, which
 *   imports it
 */

import type {BaseSequencer} from 'vitest/node';

export declare const DURATIONS: string;
export declare const PER_FILE_SECONDS: number;
export declare const LEG_PARALLELISM: number;
export declare function partitionByDuration(
  files: string[],
  count: number,
  seconds: Record<string, number>,
  options?: {legOneSeconds?: number},
): string[][];
export declare function readLegOneSeconds(file?: string): number;
export declare function recordLegOneSteps(
  text: string,
  names: string[],
): Record<string, number>;
export declare function mergeRecord(
  current: Record<string, number>,
  recorded: Record<string, number>,
  exists?: (file: string) => boolean,
): Record<string, number>;
export declare function readDurations(file?: string): Record<string, number>;
export declare function recordDurations(text: string): Record<string, number>;
declare const DurationShardSequencer: typeof BaseSequencer;
export default DurationShardSequencer;
