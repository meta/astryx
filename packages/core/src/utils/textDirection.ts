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
 * A character from a right-to-left block: Hebrew, Arabic (with its
 * supplements and presentation forms), Syriac, Thaana, NKo, Samaritan and
 * Mandaic, and the supplementary right-to-left blocks such as Adlam.
 */
const RIGHT_TO_LEFT_LETTER =
  /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF\u{10800}-\u{10FFF}\u{1E800}-\u{1EFFF}]/u;

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
