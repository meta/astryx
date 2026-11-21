// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file textDirection.ts
 * @input A component's text content (a string, a number, or a rich node)
 * @output textDirectionProps: `dir="ltr"` for plain text that holds no
 *   right-to-left letter, otherwise nothing, so the text keeps the page's
 *   direction. localeTextStyles: `isolate` for inline text a locale formats
 *   and `pageAlign` for a field that shows it
 * @position Core-internal helper, not exported from the package. Badge,
 *   Token and InputGroupText put textDirectionProps on the element that holds
 *   caller text, beside `unicode-bidi: isolate`. TimeInput and DateTimeInput
 *   put localeTextStyles, with `getLocaleDirection` as `dir`, on the elements
 *   that show their formatted time and date text.
 */

import type {ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {hasStrongRightToLeft} from '../i18n/firstStrongDirection';

/**
 * Under a right-to-left page, weak and neutral characters in left-to-right
 * text reorder (`https://` reads `//:https`, `+3` reads `3+`). Plain text
 * with no right-to-left letter therefore lays out left to right. Text with
 * one keeps the page's direction, so a right-to-left label that starts with
 * a Latin word still reads right to left. A rich node is left alone: its
 * caller marks direction on its own content.
 */
export function textDirectionProps(content: ReactNode): {dir?: 'ltr'} {
  if (typeof content !== 'string' && typeof content !== 'number') {
    return {};
  }
  return hasStrongRightToLeft(String(content)) ? {} : {dir: 'ltr'};
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
