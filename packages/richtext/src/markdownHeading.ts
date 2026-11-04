// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file markdownHeading.ts
 * @input Uses @lexical/markdown (Lexical's HEADING element transformer).
 * @output Exports HEADING_MARKERS, Lexical's heading transformer reading an
 *   ATX heading marker as CommonMark does.
 * @position Part of DEFAULT_TRANSFORMERS (markdownTable.ts) in place of
 *   Lexical's HEADING, whose pattern allows no indentation. Matches core
 *   Markdown's ATX headings (CommonMark 0.31 §4.2). Typing shortcuts keep
 *   Lexical's own trigger: `# ` makes a heading. Text that starts like a
 *   marker is escaped on export by markdownSource.ts.
 */

import {HEADING, type ElementTransformer} from '@lexical/markdown';

/** Lexical's own heading marker, which the typing shortcut keeps using. */
const SHORTCUT_MARKER = /^(#{1,6})\s/;

/**
 * An ATX heading marker: up to three spaces of indentation, then one to six
 * `#` and a space, so `   # h` imports as a heading, as in core Markdown. A
 * typed line becomes a heading only at Lexical's own `# `, so typing
 * `   # ` changes nothing new.
 */
export const HEADING_MARKERS: ElementTransformer = {
  ...HEADING,
  regExp: /^ {0,3}(#{1,6})\s/,
  replace: (parentNode, children, match, isImport) =>
    isImport || SHORTCUT_MARKER.test(match[0])
      ? HEADING.replace(parentNode, children, match, isImport)
      : false,
};
