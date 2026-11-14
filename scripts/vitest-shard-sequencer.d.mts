// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file vitest-shard-sequencer.d.mts
 * @output Types for vitest-shard-sequencer.mjs, for vitest.config.ts, which
 *   imports it
 */

import type {BaseSequencer} from 'vitest/node';

export declare const DURATIONS: string;
export declare const PER_FILE_SECONDS: number;
export declare function partitionByDuration(
  files: string[],
  count: number,
  seconds: Record<string, number>,
  options?: {idle?: Set<string>},
): string[][];
export declare function idleSwizzleSlices(
  files: string[],
): Promise<Set<string>>;
export declare function mergeRecord(
  current: Record<string, number>,
  recorded: Record<string, number>,
  exists?: (file: string) => boolean,
): Record<string, number>;
export declare function readDurations(file?: string): Record<string, number>;
export declare function recordDurations(text: string): Record<string, number>;
declare const DurationShardSequencer: typeof BaseSequencer;
export default DurationShardSequencer;
