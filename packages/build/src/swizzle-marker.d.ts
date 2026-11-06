// Copyright (c) Meta Platforms, Inc. and affiliates.

/** The file `astryx swizzle` writes into its output folder. */
export declare const SWIZZLE_MARKER: string;

/**
 * Whether a module is in a swizzled copy: a folder at or above it holds the
 * marker. One `memo` per build pass looks each folder up once.
 */
export declare function isSwizzledSource(
  filePath: string,
  memo?: Map<string, boolean>,
): boolean;
