// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file textDirection.ts
 * @input For textDirectionProps, a component's text content (a string, a
 *   number, or a rich node)
 * @output textDirectionProps (`dir="ltr"` for plain text with no
 *   right-to-left letter), cutTextDirection (a cut label's own direction),
 *   withTextDirection (that text in a `dir` span), isolatedText (one item's
 *   text in its own isolated span), localeTextStyles and truncatedTextStyles
 *   (`pageAlign` for an element with its own `dir`), and cutText (a label in
 *   a span that cuts it)
 * @position Core-internal helper, not exported from the package: the one
 *   owner of direction decisions for caller text (a locale's own direction
 *   comes from getLocaleDirection)
 */

import {createElement, type ReactElement, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  firstStrongDirection,
  hasStrongRightToLeft,
} from '../i18n/firstStrongDirection';

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

/**
 * The direction of a label that cuts its own text with an ellipsis. The
 * element's own direction decides which end the ellipsis cuts. Text with no
 * right-to-left letter takes `ltr`, so a Latin label keeps its start on a
 * right-to-left page ("Mon…"). Text whose letters are all right-to-left takes
 * `rtl`, so a Hebrew or Arabic label keeps its start on a left-to-right page.
 * Text that mixes both scripts, and a rich node, take no direction and follow
 * the page.
 */
export function cutTextDirection(content: ReactNode): {dir?: 'ltr' | 'rtl'} {
  if (typeof content !== 'string' && typeof content !== 'number') {
    return {};
  }
  const text = String(content);
  if (!hasStrongRightToLeft(text)) {
    return {dir: 'ltr'};
  }
  return hasStrongLeftToRight(text) ? {} : {dir: 'rtl'};
}

function hasStrongLeftToRight(text: string): boolean {
  for (const character of text) {
    if (firstStrongDirection(character) === 'ltr') {
      return true;
    }
  }
  return false;
}

/**
 * For an element that cuts its own text with an ellipsis and takes
 * `cutTextDirection`. Put `pageAlign` beside the `dir` so the element keeps
 * the page's alignment.
 */
export const truncatedTextStyles = stylex.create({
  pageAlign: {
    textAlign: stylex.firstThatWorks('match-parent', '-webkit-match-parent'),
  },
});

/**
 * The same `pageAlign` for a field that shows text a locale formats, with
 * the locale's direction as its `dir`. A field's own `dir` would otherwise
 * move its text to the other side. `match-parent` resolves `start` and `end`
 * in the parent's direction, so the text stays at the page's start edge, and
 * a centred `withTextDirection` label stays centred. Chromium supports only
 * the prefixed keyword.
 */
export const localeTextStyles = truncatedTextStyles;

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
        {dir, ...stylex.props(truncatedTextStyles.pageAlign)},
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

/**
 * The text in a span that cuts it with an ellipsis (`style`). Plain text in one
 * script takes its own direction (`cutTextDirection`) with the page's
 * alignment, so a cut label keeps its start on either page.
 */
export function cutText(
  text: ReactNode,
  style: stylex.StyleXStyles,
): ReactElement {
  const {dir} = cutTextDirection(text);
  return createElement(
    'span',
    {
      dir,
      ...stylex.props(style, dir != null && truncatedTextStyles.pageAlign),
    },
    text,
  );
}
