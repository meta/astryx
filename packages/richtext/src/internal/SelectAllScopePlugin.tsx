// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file SelectAllScopePlugin.tsx
 * @input Uses @lexical/react (composer context), @lexical/code (CodeNode),
 *   @lexical/table (TableCellNode), and lexical (the select-all command and
 *   selection).
 * @output Exports SelectAllScopePlugin, which makes Cmd+A (Ctrl+A off Apple
 *   platforms) select the content of the code block or table cell holding the
 *   caret first, and the whole document on the next press.
 * @position Rendered by RichTextEditor, always on; a read-only or disabled
 *   editor keeps the browser's and Lexical's select all. Elsewhere, and when
 *   the selection already covers its code block or cell or runs outside it,
 *   the press falls through to Lexical's own select all, which takes the
 *   whole document.
 */

import {useEffect} from 'react';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {$isCodeNode} from '@lexical/code';
import {$isTableCellNode} from '@lexical/table';
import {
  $getSelection,
  $isBlockFullySelected,
  $isRangeSelection,
  COMMAND_PRIORITY_NORMAL,
  SELECT_ALL_COMMAND,
  type ElementNode,
  type LexicalEditor,
  type LexicalNode,
} from 'lexical';

/** Whether select all stops at `node` before taking the whole document. */
function $isScope(node: LexicalNode): node is ElementNode {
  return $isCodeNode(node) || $isTableCellNode(node);
}

/** The scopes holding `node`, innermost first. */
function $scopesOf(node: LexicalNode): Array<ElementNode> {
  const scopes: Array<ElementNode> = [];
  for (let at: LexicalNode | null = node; at !== null; at = at.getParent()) {
    if ($isScope(at)) {
      scopes.push(at);
    }
  }
  return scopes;
}

/**
 * Selects the content of the innermost scope that holds the whole selection
 * and is not yet fully selected; false, to let the document be selected,
 * when there is none.
 */
function $selectScope(): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return false;
  }
  const focusScopes = $scopesOf(selection.focus.getNode());
  for (const scope of $scopesOf(selection.anchor.getNode())) {
    if (
      focusScopes.some(each => each.is(scope)) &&
      !$isBlockFullySelected(scope, selection)
    ) {
      scope.select(0, scope.getChildrenSize());
      return true;
    }
  }
  return false;
}

function registerSelectAllScope(editor: LexicalEditor): () => void {
  return editor.registerCommand(
    SELECT_ALL_COMMAND,
    () => editor.isEditable() && $selectScope(),
    COMMAND_PRIORITY_NORMAL,
  );
}

export function SelectAllScopePlugin(): null {
  const [editor] = useLexicalComposerContext();
  useEffect(() => registerSelectAllScope(editor), [editor]);
  return null;
}
