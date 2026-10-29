// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file unthemedLength.ts
 * @input A computed style value as jsdom reports it
 * @output unthemedLength — the length that value resolves to when no theme sets
 *   the custom properties it reads
 * @position Shared test helper; imported by tests that check an Icon's size
 *   without a theme
 *
 * Icon's glyph dimensions read the `icon` target's private vars with each
 * size's rem value as the fallback, so a theme can set them. jsdom keeps
 * `var()` and `min()` as written, so a test without a theme reads them through
 * this helper.
 *
 * SYNC: When modified, update this header.
 */

/**
 * Resolve every `var()` in `value` to its fallback and reduce a `min()` of two
 * equal lengths, writing StyleX's `.75rem` as `0.75rem`. Anything else comes
 * back unchanged, so a comparison against the expected length fails.
 *
 * @param value Computed style value, e.g. `var(--_icon-width,.75rem)`.
 * @returns The length without theme values, e.g. `0.75rem`.
 */
export function unthemedLength(value: string): string {
  const resolved = value
    .replace(/var\(\s*--[\w-]+\s*,\s*([^()]+?)\s*\)/g, '$1')
    .replace(/\s+/g, '');
  const min = /^min\(([^,()]+),([^,()]+)\)$/.exec(resolved);
  const length = min && min[1] === min[2] ? min[1] : resolved;
  return length.replace(/^\./, '0.');
}
