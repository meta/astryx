// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file listFormat.ts
 * @input A BCP 47 locale
 * @output createListFormatter, a function that joins strings as a list in
 *   that locale
 * @position Internal formatter that joins items as a conjunction list.
 *   useListFormatter.ts binds it to the provider locale for components; the
 *   PowerSearch value formatters call it directly, because the server-safe
 *   `PowerSearch/utils` entry cannot import a client hook. Not exported from
 *   the i18n barrel.
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
