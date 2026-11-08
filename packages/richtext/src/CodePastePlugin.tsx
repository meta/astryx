// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file CodePastePlugin.tsx
 * @input Uses @lexical/react (composer context), @lexical/code (CodeNode), and
 *   lexical.
 * @output Exports CodePastePlugin, which makes rich content pasted or dropped
 *   into a code block go in as plain lines of code.
 * @position Rendered by RichTextEditor; always on; not exported. A paste
 *   whose selection starts in a code block goes in as plain text: the
 *   clipboard's plain text, or else one line per pasted block.
 */

import {useEffect} from 'react';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {$isCodeNode} from '@lexical/code';
import {
  $addUpdateTag,
  $findMatchingParent,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isSelectionCapturedInDecoratorInput,
  COMMAND_PRIORITY_LOW,
  isDOMNode,
  mergeRegister,
  PASTE_COMMAND,
  PASTE_TAG,
  SELECTION_INSERT_CLIPBOARD_NODES_COMMAND,
  type BaseSelection,
  type LexicalNode,
  type RangeSelection,
} from 'lexical';

/** Clipboard types that carry more than plain text. */
const RICH_TYPES = ['text/html', 'application/x-lexical-editor'];

/** Whether content inserted at the selection lands in a code block. */
function $startsInCodeBlock(
  selection: BaseSelection | null,
): selection is RangeSelection {
  if (!$isRangeSelection(selection)) {
    return false;
  }
  const start = selection.isBackward() ? selection.focus : selection.anchor;
  const node = start.getNode();
  // A link (an autolinked URL) can sit between the text and its code block.
  return $findMatchingParent(node, $isCodeNode) !== null;
}

/**
 * Clipboard nodes as plain lines: each block's text on a line of its own (a
 * paragraph, a heading, a list item, a table cell), and inline content
 * between blocks on one line.
 */
function $plainLinesOf(nodes: ReadonlyArray<LexicalNode>): string {
  const lines: string[] = [];
  let inline: string | null = null;
  const endInline = () => {
    if (inline != null) {
      lines.push(inline);
      inline = null;
    }
  };
  const visit = (node: LexicalNode) => {
    if (node.isInline()) {
      inline = (inline ?? '') + node.getTextContent();
      return;
    }
    endInline();
    if (
      $isElementNode(node) &&
      node.getChildren().some(child => !child.isInline())
    ) {
      node.getChildren().forEach(visit);
      endInline();
    } else {
      lines.push(node.getTextContent());
    }
  };
  nodes.forEach(visit);
  endInline();
  return lines.join('\n');
}

export function CodePastePlugin(): null {
  const [editor] = useLexicalComposerContext();
  useEffect(
    () =>
      mergeRegister(
        // Ahead of the rich-text paste, which inserts the clipboard's rich
        // content when there is any.
        editor.registerCommand(
          PASTE_COMMAND,
          event => {
            // A paste into an input a decorator node renders is that input's.
            if (
              isDOMNode(event.target) &&
              $isSelectionCapturedInDecoratorInput(event.target)
            ) {
              return false;
            }
            const data = 'clipboardData' in event ? event.clipboardData : null;
            if (
              !editor.isEditable() ||
              data == null ||
              !RICH_TYPES.some(type => data.types.includes(type))
            ) {
              return false;
            }
            const text = data.getData('text/plain');
            const selection = $getSelection();
            if (text === '' || !$startsInCodeBlock(selection)) {
              return false;
            }
            event.preventDefault();
            // Its own undo step, as every paste is.
            $addUpdateTag(PASTE_TAG);
            selection.insertRawText(text);
            return true;
          },
          COMMAND_PRIORITY_LOW,
        ),
        // Every insertion of clipboard nodes, a paste with no plain text or a
        // drop, comes through here; ahead of the table's own handler.
        editor.registerCommand(
          SELECTION_INSERT_CLIPBOARD_NODES_COMMAND,
          ({nodes, selection}) => {
            if (!$startsInCodeBlock(selection)) {
              return false;
            }
            selection.insertRawText($plainLinesOf(nodes));
            return true;
          },
          COMMAND_PRIORITY_LOW,
        ),
      ),
    [editor],
  );
  return null;
}
