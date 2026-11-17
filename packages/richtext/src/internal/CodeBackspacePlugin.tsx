// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file CodeBackspacePlugin.tsx
 * @input Uses @lexical/react (composer context), @lexical/code (CodeNode), and
 *   lexical.
 * @output Exports CodeBackspacePlugin, which makes Backspace at the very start
 *   of a code block turn the block into a paragraph holding its lines.
 * @position Rendered by RichTextEditor; always on, not exported. Lexical's
 *   own Backspace there merges the code into the block above, and a heading
 *   above reads back as a longer heading and a stray paragraph.
 */

import {useEffect} from 'react';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {$isCodeNode, type CodeNode} from '@lexical/code';
import {
  $createLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  DELETE_CHARACTER_COMMAND,
  type ParagraphNode,
} from 'lexical';

/** Start is offset 0 of the block or of its first child, not the start of a later line. */
function $codeBlockAtCaretStart(): CodeNode | null {
  const selection = $getSelection();
  if (
    !$isRangeSelection(selection) ||
    !selection.isCollapsed() ||
    selection.anchor.offset !== 0
  ) {
    return null;
  }
  const node = selection.anchor.getNode();
  const code = $isCodeNode(node) ? node : node.getParent();
  if (!$isCodeNode(code)) {
    return null;
  }
  return node.is(code) || node.is(code.getFirstChild()) ? code : null;
}

/**
 * A newline inside text exports as a soft break, and the lines read back as
 * one. A line break node exports as a hard break. Empty lines at the end of
 * the code are dropped: a hard break that ends a paragraph reads back as a
 * literal backslash.
 */
function $paragraphOfLines(code: CodeNode): ParagraphNode {
  const paragraph = $createParagraphNode();
  code
    .getTextContent()
    .replace(/\n+$/, '')
    .split('\n')
    .forEach((line, index) => {
      if (index > 0) {
        paragraph.append($createLineBreakNode());
      }
      if (line !== '') {
        paragraph.append($createTextNode(line));
      }
    });
  return paragraph;
}

export function CodeBackspacePlugin(): null {
  const [editor] = useLexicalComposerContext();
  useEffect(
    () =>
      editor.registerCommand(
        DELETE_CHARACTER_COMMAND,
        isBackward => {
          if (!isBackward || !editor.isEditable()) {
            return false;
          }
          const code = $codeBlockAtCaretStart();
          if (code == null) {
            return false;
          }
          const paragraph = $paragraphOfLines(code);
          code.replace(paragraph);
          paragraph.selectStart();
          return true;
        },
        // Ahead of the rich-text deletion, which would do the merge.
        COMMAND_PRIORITY_LOW,
      ),
    [editor],
  );
  return null;
}
