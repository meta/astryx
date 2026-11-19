// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file platforms.ts
 * @input None
 * @output The native platform names shared by contracts, types, themes, and icons
 * @position Foundation; every other module keys platform data by these names
 */

/** Native platforms, in the order AST-082 lists them. */
export const NATIVE_PLATFORMS = ['ios', 'android', 'macos', 'windows'] as const;

export type NativePlatform = (typeof NATIVE_PLATFORMS)[number];

/** Type-resolution condition that exposes only core contracts (AST-082 FR6). */
export const SHARED_CONDITION = 'shared';

export function isNativePlatform(value: string): value is NativePlatform {
  return (NATIVE_PLATFORMS as readonly string[]).includes(value);
}
