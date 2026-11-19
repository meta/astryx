// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file vitest-node-files.d.mts
 * @output Types for vitest-node-files.mjs, for vitest.config.ts, which
 *   imports it
 */

export declare const NODE_TEST_INCLUDE: string[];
export declare const NODE_TEST_EXCLUDE: string[];
export declare const SWIZZLE_PROOF_SLICES: string;
export declare const VITEST_DEFAULT_EXCLUDE: string[];
export declare function nodeTestFiles(
  paths: string[],
  options?: {swizzleProofOwnJob?: boolean},
): string[];
