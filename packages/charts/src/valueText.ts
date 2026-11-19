// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file valueText.ts
 * @output The shared default value text and the resolver that turns one chart
 *         value into display text
 * @position Used by Chart (hidden data table) and ChartTooltip (default body),
 *           so both surfaces show the same text for the same value.
 */

/** The default text for a present value with no declared format. */
export const defaultValueText: (value: unknown) => string = String;

/**
 * Returns the display text for one chart value. An empty value (`null` or
 * `undefined`) reads `noDataText`. Every other value, `NaN` and infinities
 * included, reads its default text.
 */
export function resolveValueText(value: unknown, noDataText: string): string {
  return value == null ? noDataText : defaultValueText(value);
}
