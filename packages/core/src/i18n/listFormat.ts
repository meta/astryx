// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file listFormat.ts
 * @input A BCP 47 locale
 * @output createListFormatter, a function that joins strings as a list in
 *   that locale, and createListPartsFormatter, the same list as its items and
 *   the locale's separators
 * @position Internal list formatter with no React dependency.
 *   `useListFormatter` binds it to the provider locale. The server-safe
 *   PowerSearch formatters call it directly.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/i18n/useListFormatter.ts
 * - /internal/eslint-plugin-astryx/no-raw-intl-locale.js
 */

import type {Locale} from './types';

/**
 * Joins items as a narrow conjunction list (`a, b, c` in English). The narrow
 * conjunction separates items in every shipped locale, including whole
 * sentences, where a unit list runs them together in some (no separator in
 * zh-CN, only a space in ja-JP).
 */
export function createListFormatter(
  locale: Locale,
): (items: ReadonlyArray<string>) => string {
  const format = new Intl.ListFormat(locale, {
    type: 'conjunction',
    style: 'narrow',
  });
  return items => format.format(items);
}

/** One piece of a formatted list: an item, or a separator the locale adds. */
export type ListPart = {
  readonly type: 'element' | 'literal';
  readonly value: string;
};

/**
 * The same list as `createListFormatter`, as its items and separators in
 * order, so a caller can mark each item up on its own (for example, isolate
 * its text direction) and keep the locale's separators and order.
 */
export function createListPartsFormatter(
  locale: Locale,
): (items: ReadonlyArray<string>) => ReadonlyArray<ListPart> {
  const format = new Intl.ListFormat(locale, {
    type: 'conjunction',
    style: 'narrow',
  });
  return items => format.formatToParts(items);
}
