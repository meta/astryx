// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file markdownHardLineBreak.ts
 * @input Uses lexical (LineBreakNode) and @lexical/markdown
 *   (TextMatchTransformer).
 * @output Exports HARD_LINE_BREAK, the transformer that writes a line break
 *   added in the editor (Shift+Enter) as a Markdown hard break, `\` and a
 *   line ending.
 * @position Part of DEFAULT_TRANSFORMERS (markdownTable.ts). Import joins
 *   soft line breaks into their block (markdownSource.ts), so every line
 *   break left in a paragraph, list item, or quote is a hard one. Lexical
 *   writes the breaks it imported as hard with their own marker (two spaces
 *   or a backslash); a break typed in the editor has none and would be
 *   written as a plain line ending, which reads back as a soft break and
 *   loses the line (spec:AST-062 FR3). Headings are one line in Markdown, so
 *   a break typed in one keeps Lexical's plain line ending.
 */

import type {TextMatchTransformer} from '@lexical/markdown';
import {$isHeadingNode} from '@lexical/rich-text';
import {$findMatchingParent} from '@lexical/utils';
import {$isLineBreakNode, LineBreakNode} from 'lexical';

/** Whether Lexical's Markdown import marked this line break as a hard one. */
export function isMarkedHardLineBreak(node: LineBreakNode): boolean {
  const serialized = node.exportJSON() as {$?: {mdHardLineBreak?: unknown}};
  return (
    typeof serialized.$?.mdHardLineBreak === 'string' &&
    serialized.$.mdHardLineBreak !== ''
  );
}

export const HARD_LINE_BREAK: TextMatchTransformer = {
  dependencies: [LineBreakNode],
  export: node =>
    $isLineBreakNode(node) &&
    !isMarkedHardLineBreak(node) &&
    // A heading is one line in Markdown; a break inside one has no hard-break
    // form, so it keeps Lexical's plain line ending.
    $findMatchingParent(node, $isHeadingNode) == null
      ? '\\\n'
      : null,
  // Export only: Lexical's own import recognizes hard breaks.
  regExp: /(?!)/,
  type: 'text-match',
};
