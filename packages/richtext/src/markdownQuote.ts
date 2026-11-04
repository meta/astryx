// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file markdownQuote.ts
 * @input Uses @lexical/markdown (Lexical's QUOTE element transformer).
 * @output Exports QUOTE_MARKERS, Lexical's quote transformer reading a block
 *   quote marker as CommonMark does.
 * @position Part of DEFAULT_TRANSFORMERS (markdownTable.ts) in place of
 *   Lexical's QUOTE, whose pattern needs a space after `>` and no indentation.
 *   Matches core Markdown's block quote marker (CommonMark 0.31 §5.1). Typing
 *   shortcuts keep Lexical's own trigger: `> ` makes a quote. Text that starts
 *   like a marker is escaped on export by markdownSource.ts.
 */

import {QUOTE, type ElementTransformer} from '@lexical/markdown';

/** Lexical's own quote marker, which the typing shortcut keeps using. */
const SHORTCUT_MARKER = /^>\s/;

/**
 * A block quote marker: up to three spaces of indentation, then `>` and the
 * one space or tab that may follow it, so `>a` and `   > a` import as quotes,
 * as in core Markdown. A typed line becomes a quote only at Lexical's own
 * `> `, so typing `>` and Enter, or `   > `, changes nothing new. RichText
 * quotes do not nest: the marker of a quote inside a quote stays in the
 * outer quote's text.
 */
export const QUOTE_MARKERS: ElementTransformer = {
  ...QUOTE,
  regExp: /^ {0,3}>[ \t]?/,
  replace: (parentNode, children, match, isImport) =>
    isImport || SHORTCUT_MARKER.test(match[0])
      ? QUOTE.replace(parentNode, children, match, isImport)
      : false,
};
