// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file localeTextDirection.ts
 * @input The provider's BCP 47 locale
 * @output localeTextDirection: the `dir` for an element that shows text a
 *   locale formats, such as a time or a date. localeTextStyles: `isolate`
 *   for inline formatted text and `pageAlign` for a field that shows it
 * @position Internal helper for TimeInput, DateTimeInput and their touch
 *   fields; not part of the public surface
 *
 * Formatted time and date-time text reads in the direction of the locale
 * that formats it, not the page's (design:bidirectionality DR2). "9:00 AM"
 * from an English locale keeps its order on a right-to-left page. The field's
 * layout, such as the icon side, stays on the page direction.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/i18n/getLocaleDirection.ts
 * - /packages/core/src/utils/localeTextDirection.test.ts
 */

import * as stylex from '@stylexjs/stylex';
import {readLocaleDirection} from '../i18n/getLocaleDirection';

/**
 * The direction of text the locale formats. Where the engine cannot tell,
 * `auto` takes it from the text's first strong letter.
 */
export function localeTextDirection(locale: string): 'ltr' | 'rtl' | 'auto' {
  return readLocaleDirection(locale) ?? 'auto';
}

export const localeTextStyles = stylex.create({
  isolate: {
    unicodeBidi: 'isolate',
  },
  // A field's own `dir` would otherwise move its text to the other side.
  // `match-parent` takes the parent's alignment in the parent's direction.
  // Chromium supports only the prefixed keyword.
  pageAlign: {
    textAlign: stylex.firstThatWorks('match-parent', '-webkit-match-parent'),
  },
});
