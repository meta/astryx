// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file mergeIds.ts
 * @input ARIA id-reference strings, some of which may be missing
 * @output One space-separated id-reference string, or undefined when empty
 * @position Shared by components that compose aria-* id references
 */

export function mergeIds(
  ...ids: (string | undefined | null)[]
): string | undefined {
  const filtered = ids.filter(Boolean);
  return filtered.length > 0 ? filtered.join(' ') : undefined;
}
