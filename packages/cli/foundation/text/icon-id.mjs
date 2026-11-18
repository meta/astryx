// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The icon id an export name stands for. Writing an icon set names
 * each icon by it, and the icon finder reads a query word written as an
 * export name by it.
 *
 * @input an export name (`XMarkIcon`, `Bars3Icon`)
 * @output the icon id (`x-mark`, `bars-3`)
 * @position packages/cli/foundation/text — naming rules shared by discovery and search
 */

/**
 * `XMarkIcon` → `x-mark`; `Trash2` → `trash-2`; `ArrowUpDown` →
 * `arrow-up-down`; `Squares2X2Icon` and `Grid2x2` → `squares-2x2`,
 * `grid-2x2`: an icon id from an export name. A dimension (a digit, `x` or
 * `X`, a digit) stays one word.
 * @param {string} name
 */
export function iconIdOf(name) {
  return (
    name
      .replace(/Icon$/u, '')
      // `2X2` and `2x2` are one word: lower the x first.
      .replace(/([0-9])[xX](?=[0-9])/gu, '$1x')
      // A one-letter word before a digit ends there: `CalendarX2` is
      // `calendar-x-2`, as its library names it.
      .replace(/([a-z][A-Z])(?=[0-9])/gu, '$1-')
      // A lower-case letter before a capital or a digit ends a word, except
      // the x inside a dimension.
      .replace(/([a-z])(?=[A-Z0-9])/gu, (match, letter, offset, whole) =>
        letter === 'x' && /[0-9]/u.test(whole[offset - 1] ?? '')
          ? letter
          : `${letter}-`,
      )
      .replace(/([0-9])([A-Z])/gu, '$1-$2')
      .replace(/([A-Z])([A-Z][a-z])/gu, '$1-$2')
      .toLowerCase()
  );
}
