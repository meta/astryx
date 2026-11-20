// Copyright (c) Meta Platforms, Inc. and affiliates.

/** The marker file in a swizzle output folder. */
export declare const SWIZZLE_MARKER: string;

/**
 * Whether a module is in a swizzled copy: a folder at or above it holds the
 * marker. One `memo` per build pass looks each folder up once.
 */
/** The marker paths from a module's folder up to `stopDir` or the root. */
export declare function markerPaths(
  filePath: string,
  stopDir?: string,
): string[];

export declare function isSwizzledSource(
  filePath: string,
  memo?: Map<string, boolean>,
): boolean;
