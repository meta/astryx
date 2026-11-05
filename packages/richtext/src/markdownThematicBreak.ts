// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file markdownThematicBreak.ts
 * @input Uses @lexical/extension (HorizontalRuleNode), @lexical/markdown
 *   (ElementTransformer), and lexical.
 * @output Exports THEMATIC_BREAK, the Markdown transformer that turns a
 *   thematic break line into a horizontal rule and writes a rule back as `---`.
 * @position Part of DEFAULT_TRANSFORMERS (markdownTable.ts), ahead of
 *   Lexical's list transformers so `* * *` and `- - -` are rules, as in
 *   CommonMark. Matches core Markdown's thematic breaks (spec:AST-061 FR5).
 */

import {
  $createHorizontalRuleNode,
  $isHorizontalRuleNode,
  HorizontalRuleNode,
} from '@lexical/extension';
import type {ElementTransformer} from '@lexical/markdown';
import {$isParagraphNode, $isTextNode} from 'lexical';

/**
 * Three or more `-`, `*`, or `_` of one kind, optionally spaced, indented at
 * most three spaces (CommonMark 0.31, thematic breaks).
 */
const THEMATIC_BREAK_LINE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;

/**
 * A setext heading underline made of dashes: no spaces between them, so
 * `- - -` under a paragraph is still a thematic break (CommonMark 0.31).
 */
const SETEXT_UNDERLINE = /^ {0,3}-+[ \t]*$/;

export const THEMATIC_BREAK: ElementTransformer = {
  dependencies: [HorizontalRuleNode],
  export: node => ($isHorizontalRuleNode(node) ? '---' : null),
  regExp: THEMATIC_BREAK_LINE,
  replace: (parentNode, children, match, isImport) => {
    // A dash line right under a paragraph line underlines it as a heading
    // (setext) rather than breaking. Lexical has already cut the matched text
    // out of the line; put it back and leave the line to the paragraph, which
    // keeps it as literal text.
    const previous = parentNode.getPreviousSibling();
    if (
      isImport &&
      SETEXT_UNDERLINE.test(match[0]) &&
      $isParagraphNode(previous) &&
      previous.getTextContentSize() > 0
    ) {
      const [line] = children;
      if ($isTextNode(line)) {
        // The pattern is anchored to the whole line, so its match is the line.
        line.setTextContent(match[0]);
      }
      return false;
    }
    const rule = $createHorizontalRuleNode();
    if (isImport || parentNode.getNextSibling() != null) {
      parentNode.replace(rule);
    } else {
      parentNode.insertBefore(rule);
    }
    rule.selectNext();
  },
  type: 'element',
};
