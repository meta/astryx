// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file mergeIds.ts
 * @input ARIA id-reference strings, some of which may be missing
 * @output One space-separated id-reference string, or undefined when empty
 * @position Shared by HoverCard and Timestamp's card for `aria-controls` and
 *   `aria-describedby`
 */

export function mergeIds(
  ...ids: (string | undefined | null)[]
): string | undefined {
  const filtered = ids.filter(Boolean);
  return filtered.length > 0 ? filtered.join(' ') : undefined;
}
