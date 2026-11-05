// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file clampInlineSize.ts
 * @input A consumer's preferred inline size and the runtime's viewport cap
 * @output The size clamped to the cap, or the keyword left as written
 * @position Layer runtime geometry; spec:AST-059 FR7 — a consumer's own size
 *   rule cannot defeat the viewport cap
 */

const INTRINSIC_AND_CSS_WIDE_WIDTHS = new Set([
  'auto',
  'contain',
  'fit-content',
  'inherit',
  'initial',
  'max-content',
  'min-content',
  'revert',
  'revert-layer',
  'stretch',
  'unset',
]);

/**
 * Whether a width value is an intrinsic or CSS-wide keyword. Those cannot be
 * arguments to `min()`, so a consumer applies them as written and lets the
 * painted surface's own cap bound the result.
 */
export function isIntrinsicInlineSize(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    INTRINSIC_AND_CSS_WIDE_WIDTHS.has(normalized) ||
    normalized.startsWith('fit-content(')
  );
}

/**
 * Clamp a length to the runtime's viewport cap. A number is pixels. A CSS
 * minimum wins over a maximum, so a consumer that applies a preferred size as
 * `min-width` must clamp it here rather than relying on `max-inline-size`.
 */
export function clampInlineSize(
  value: number | string,
  maximum: string,
): string {
  const length = typeof value === 'number' ? `${value}px` : value.trim();
  return `min(${length}, ${maximum})`;
}
