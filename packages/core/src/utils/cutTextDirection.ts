// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file cutTextDirection.ts
 * @input A label that cuts its own text with an ellipsis
 * @output cutTextDirection (the label's direction: `ltr`, `rtl` or none) and
 *   truncatedTextStyles (the page's alignment beside that direction)
 * @position Part of the text-direction owner: textDirection.ts re-exports
 *   both. A short range test keeps this module small, so Text and Heading
 *   load it without the full classifier.
 */

import type {ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';

// The blocks of the right-to-left scripts, the right-to-left mark, and the
// two supplementary right-to-left ranges. On every letter this test agrees
// with the full classifier (firstStrongDirection.ts). The blocks also hold 18
// signs and marks that the classifier passes over: the Arabic number signs,
// the Arabic comma, the ornate parentheses and the Arabic vowel marks. Each one
// stands beside an Arabic letter in a label, so a label gets the same answer.
const RIGHT_TO_LEFT =
  /[\u0590-\u08FF\u200F\uFB1D-\uFDFF\uFE70-\uFEFC\u{10800}-\u{10FFF}\u{1E800}-\u{1EFFF}]/u;

// Built at runtime: a source build may rewrite a regular expression literal
// with a Unicode property escape.
const LETTER = new RegExp(String.raw`\p{Letter}`, 'u');

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
  let hasRightToLeft = false;
  let hasLeftToRight = false;
  for (const character of String(content)) {
    if (RIGHT_TO_LEFT.test(character)) {
      hasRightToLeft = true;
    } else if (LETTER.test(character)) {
      hasLeftToRight = true;
    }
  }
  if (!hasRightToLeft) {
    return {dir: 'ltr'};
  }
  return hasLeftToRight ? {} : {dir: 'rtl'};
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
