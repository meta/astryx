// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file markdownHardLineBreak.ts
 * @input Uses lexical (LineBreakNode) and @lexical/markdown
 *   (TextMatchTransformer).
 * @output Exports HARD_LINE_BREAK, the transformer that writes a line break
 *   added in the editor (Shift+Enter) as a Markdown hard break, `\` and a
 *   line ending, and drops a line break that ends its block.
 * @position Part of DEFAULT_TRANSFORMERS (markdownTable.ts). Import joins
 *   soft line breaks into their block (markdownSource.ts), so every line
 *   break left in a paragraph, list item, or quote is a hard one. Lexical
 *   writes the breaks it imported as hard with their own marker (two spaces
 *   or a backslash); a break typed in the editor has none and would be
 *   written as a plain line ending, which reads back as a soft break and
 *   loses the line (spec:AST-062 FR3). Headings are one line in Markdown, so
 *   a break typed in one keeps Lexical's plain line ending. A hard break has
 *   no form at the end of a block: CommonMark reads its backslash as a
 *   literal character there, and shows nothing for two trailing spaces. So a
 *   line break that only other breaks or spaces follow is written as nothing.
 */

import type {TextMatchTransformer} from '@lexical/markdown';
import {$isHeadingNode} from '@lexical/rich-text';
import {$findMatchingParent} from '@lexical/utils';
import {$isLineBreakNode, $isTextNode, LineBreakNode} from 'lexical';
import type {LexicalNode} from 'lexical';

/** Whether Lexical's Markdown import marked this line break as a hard one. */
export function isMarkedHardLineBreak(node: LineBreakNode): boolean {
  const serialized = node.exportJSON() as {$?: {mdHardLineBreak?: unknown}};
  return (
    typeof serialized.$?.mdHardLineBreak === 'string' &&
    serialized.$.mdHardLineBreak !== ''
  );
}

/** Whether only line breaks and blank text follow `node` in its block. */
function $endsItsBlock(node: LexicalNode): boolean {
  for (
    let next = node.getNextSibling();
    next != null;
    next = next.getNextSibling()
  ) {
    const isBlankText =
      $isTextNode(next) && next.getTextContent().trim() === '';
    if (!$isLineBreakNode(next) && !isBlankText) {
      return false;
    }
  }
  return true;
}

export const HARD_LINE_BREAK: TextMatchTransformer = {
  dependencies: [LineBreakNode],
  export: node => {
    if (
      !$isLineBreakNode(node) ||
      // A heading is one line in Markdown; a break inside one has no
      // hard-break form, so it keeps Lexical's plain line ending.
      $findMatchingParent(node, $isHeadingNode) != null
    ) {
      return null;
    }
    if ($endsItsBlock(node)) {
      return '';
    }
    return isMarkedHardLineBreak(node) ? null : '\\\n';
  },
  // Export only: Lexical's own import recognizes hard breaks.
  regExp: /(?!)/,
  type: 'text-match',
};
