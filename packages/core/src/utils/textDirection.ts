// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file textDirection.ts
 * @input For textDirectionProps, a component's text content (a string, a
 *   number, or a rich node)
 * @output textDirectionProps: `dir="ltr"` for plain text that holds no
 *   right-to-left letter, otherwise nothing, so the text keeps the page's
 *   direction. withTextDirection: the same text, inside a `dir="ltr"` span
 *   when it needs one. isolatedText: text in its own isolated span, for one
 *   item among others. localeTextStyles: `pageAlign` for a field that shows
 *   text a locale formats
 * @position Core-internal helper, not exported from the package. Badge and
 *   Token put textDirectionProps on the element that holds caller text,
 *   beside `unicode-bidi: isolate`. InputGroupText, Field's label and
 *   description, FieldStatus and the status tooltip use withTextDirection.
 *   MultiSelector's labels trigger puts each label in isolatedText.
 *   TimeInput and DateTimeInput put localeTextStyles, with
 *   `getLocaleDirection` as `dir`, on the fields that show their formatted
 *   time and date text; DateTimeInput's time options use isolatedText with
 *   that direction.
 */

import {createElement, type ReactElement, type ReactNode} from 'react';
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

// An element's own `dir` moves its text to the other side. A field's text and
// the `withTextDirection` span (a block inside a flex parent such as Field's
// label) need the parent's alignment instead. `match-parent` resolves `start`
// and `end` in the parent's direction, so a centred label stays centred.
// Chromium supports only the prefixed keyword.
export const localeTextStyles = stylex.create({
  pageAlign: {
    textAlign: stylex.firstThatWorks('match-parent', '-webkit-match-parent'),
  },
});

const styles = stylex.create({
  isolate: {
    unicodeBidi: 'isolate',
  },
});

/**
 * The content, inside a `dir="ltr"` span when `textDirectionProps` gives it
 * one. Use it where the direction cannot go on the element that holds the
 * text, because that element's alignment, glyph or corners follow the page.
 * The span changes the text's order only, not its alignment. An empty string
 * gets no span, so it keeps no text line.
 */
export function withTextDirection(content: ReactNode): ReactNode {
  const {dir} = textDirectionProps(content);
  return dir == null || content === ''
    ? content
    : createElement(
        'span',
        {dir, ...stylex.props(localeTextStyles.pageAlign)},
        content,
      );
}

/**
 * The text in a span that is isolated from the text around it, so one item's
 * neutral characters (a comma, a digit) never join a neighbour's run. Use it
 * for each item of a list that mixes directions. Without `dir`, the span takes
 * `textDirectionProps`: `ltr` for text with no right-to-left letter, else the
 * surrounding direction, so a right-to-left label that starts with a Latin
 * word still reads right to left. `dir` sets the direction instead, for
 * example the locale's direction for a localized count. The text content, and
 * so the accessible name, stays the same, which bidi control characters would
 * change.
 */
export function isolatedText(
  text: string,
  key?: string | number,
  dir?: 'ltr' | 'rtl',
): ReactElement {
  return createElement(
    'span',
    {
      key,
      dir: dir ?? textDirectionProps(text).dir,
      ...stylex.props(styles.isolate),
    },
    text,
  );
}
