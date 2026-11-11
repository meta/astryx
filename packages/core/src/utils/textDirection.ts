// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file textDirection.ts
 * @input A component's text content (a string, a number, or a rich node)
 * @output textDirectionProps: `dir="ltr"` for plain text that holds no
 *   right-to-left letter, otherwise nothing, so the text keeps the page's
 *   direction. useTextDirectionProps: the same, on a right-to-left page only
 * @position Core-internal helper, not exported from the package. Badge,
 *   Token and InputGroupText put it on the element that holds caller text,
 *   beside `unicode-bidi: isolate`.
 *
 * Rule: the direction mark is added only on a right-to-left page (the
 * direction from `InternationalizationProvider`). A left-to-right page lays
 * plain text out left to right already, so its markup stays unchanged.
 */

import type {ReactNode} from 'react';
import {useDirection} from '../i18n/useDirection';
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
 * `textDirectionProps` on a right-to-left page; nothing on a left-to-right
 * page, where the text already lays out left to right.
 */
export function useTextDirectionProps(content: ReactNode): {dir?: 'ltr'} {
  const isRtl = useDirection() === 'rtl';
  return isRtl ? textDirectionProps(content) : {};
}
