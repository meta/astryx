// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file textDirection.ts
 * @input A component's text content (a string, a number, or a rich node)
 * @output textDirectionProps: `dir="ltr"` for plain text that holds no
 *   right-to-left letter, otherwise nothing, so the text keeps the page's
 *   direction
 * @position Core-internal helper, not exported from the package. Badge,
 *   Token and InputGroupText put it on the element that holds caller text,
 *   beside `unicode-bidi: isolate`.
 */

import type {ReactNode} from 'react';

/**
 * A right-to-left letter: Hebrew, Arabic (with its supplements and
 * presentation forms), Syriac, Thaana and NKo.
 */
const RIGHT_TO_LEFT_LETTER =
  /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u0780-\u07BF\u07C0-\u07FF\u0860-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;

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
  return RIGHT_TO_LEFT_LETTER.test(String(content)) ? {} : {dir: 'ltr'};
}
