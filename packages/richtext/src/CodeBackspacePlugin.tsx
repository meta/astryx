// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file CodeBackspacePlugin.tsx
 * @input Uses @lexical/react (composer context), @lexical/code (CodeNode), and
 *   lexical.
 * @output Exports CodeBackspacePlugin, which makes Backspace at the very start
 *   of a code block turn the block into a paragraph holding its lines.
 * @position Rendered by RichTextEditor; always on, and not exported from the
 *   package (spec:AST-061 DEC-8). Lexical's own Backspace there merges the
 *   whole block into the block above: a heading above takes the code in, and
 *   its Markdown reads back as a longer heading and a stray paragraph
 *   (spec:AST-062 FR3). The paragraph puts a line break between the lines,
 *   which exports as a hard break, so it reads back as shown; the caret goes
 *   to its start. It handles the backward character deletion that Backspace
 *   dispatches, as do the input events some keyboards send instead. Backspace
 *   anywhere else in a code block, or over a selection, keeps Lexical's
 *   behavior. Read-only and disabled editors are unchanged.
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

/** The code block whose very start holds a collapsed caret, or null. */
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
 * A paragraph holding a code block's lines with a line break node between
 * each: a newline left inside text would export as a soft break, and the
 * lines would read back as one.
 */
function $paragraphOfLines(code: CodeNode): ParagraphNode {
  const paragraph = $createParagraphNode();
  code
    .getTextContent()
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
