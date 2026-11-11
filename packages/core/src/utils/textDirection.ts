// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file textDirection.ts
 * @input A component's text content (a string, a number, or a rich node)
 * @output textDirectionProps: `dir="ltr"` for plain text that holds no
 *   right-to-left letter, otherwise nothing, so the text keeps the page's
 *   direction. withTextDirection: the same text, inside a `dir="ltr"` span
 *   when it needs one
 * @position Core-internal helper, not exported from the package. Badge and
 *   Token put textDirectionProps on the element that holds caller text,
 *   beside `unicode-bidi: isolate`. InputGroupText, Field's label and
 *   description, FieldStatus and the status tooltip use withTextDirection.
 */

import {createElement, type ReactNode} from 'react';
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

/**
 * The content, inside a `dir="ltr"` span when `textDirectionProps` gives it
 * one. Use it where the direction cannot go on the element that holds the
 * text, because that element's alignment, glyph or corners follow the page.
 * An empty string gets no span, so it keeps no text line.
 */
export function withTextDirection(content: ReactNode): ReactNode {
  const {dir} = textDirectionProps(content);
  return dir == null || content === ''
    ? content
    : createElement('span', {dir}, content);
}
