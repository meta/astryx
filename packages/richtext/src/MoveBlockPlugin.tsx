// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file MoveBlockPlugin.tsx
 * @input Uses @lexical/react (composer context), @lexical/list, and lexical
 *   (keyboard shortcut matching, the platform flag, and update tags).
 * @output Exports MoveBlockPlugin, which moves the block holding the caret
 *   past the block above or below it on Cmd+Option+ArrowUp or
 *   Cmd+Option+ArrowDown (Ctrl+Alt off Apple platforms).
 * @position Rendered by RichTextEditor, always on; a read-only or disabled
 *   editor moves nothing. A list item moves with the items nested under it,
 *   among the items of its own list, and never leaves that list. Any other
 *   block moves among the top-level blocks, so a caret in a table moves the
 *   whole table, and a selected block such as a horizontal rule moves the
 *   same way. Each move is one undo step and keeps the caret in the moved
 *   block. A move changes no block's content, so every block keeps the
 *   Markdown it was written in (spec:AST-062 FR2).
 */

import {useEffect} from 'react';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {$isListItemNode, $isListNode, type ListItemNode} from '@lexical/list';
import {
  $addUpdateTag,
  $getSelection,
  $isNodeSelection,
  $isRangeSelection,
  $isRootNode,
  COMMAND_PRIORITY_LOW,
  HISTORY_PUSH_TAG,
  IS_APPLE,
  isExactShortcutMatch,
  KEY_DOWN_COMMAND,
  type LexicalEditor,
  type LexicalNode,
} from 'lexical';

type Direction = 'up' | 'down';

/** Cmd+Option on Apple platforms, Ctrl+Alt elsewhere, and nothing else. */
const MOVE_MODIFIERS = {ctrlKey: !IS_APPLE, metaKey: IS_APPLE, altKey: true};

function directionOf(event: KeyboardEvent): Direction | null {
  if (isExactShortcutMatch(event, 'ArrowUp', MOVE_MODIFIERS)) {
    return 'up';
  }
  if (isExactShortcutMatch(event, 'ArrowDown', MOVE_MODIFIERS)) {
    return 'down';
  }
  return null;
}

/** Whether `node` is the item Lexical nests a list in, not an item itself. */
function $holdsNestedList(node: LexicalNode | null): node is ListItemNode {
  return (
    $isListItemNode(node) &&
    node.getChildrenSize() === 1 &&
    $isListNode(node.getFirstChild())
  );
}

/** A list item and the list nested under it, which move together. */
function $itemWithNested(item: ListItemNode): Array<LexicalNode> {
  const next = item.getNextSibling();
  return $holdsNestedList(next) ? [item, next] : [item];
}

/**
 * What moves for a point in `node`: the nearest list item, with the list
 * nested under it, or else the top-level block that holds it.
 */
function $movableAt(node: LexicalNode): Array<LexicalNode> | null {
  for (let at: LexicalNode | null = node; at !== null; at = at.getParent()) {
    if ($isListItemNode(at) && !$holdsNestedList(at)) {
      return $itemWithNested(at);
    }
    if ($isRootNode(at.getParent())) {
      return [at];
    }
  }
  return null;
}

/**
 * What the selection moves: a selected top-level block, or what holds the
 * caret. A selection that runs across blocks moves nothing.
 */
function $selectedMovable(): Array<LexicalNode> | null {
  const selection = $getSelection();
  if ($isNodeSelection(selection)) {
    const nodes = selection.getNodes();
    return nodes.length === 1 && $isRootNode(nodes[0].getParent())
      ? nodes
      : null;
  }
  if (!$isRangeSelection(selection)) {
    return null;
  }
  const anchor = $movableAt(selection.anchor.getNode());
  const focus = $movableAt(selection.focus.getNode());
  return anchor !== null && focus !== null && anchor[0].is(focus[0])
    ? anchor
    : null;
}

/** The sibling `nodes` move past, with what moves with it, or null at an end. */
function $neighborOf(
  nodes: ReadonlyArray<LexicalNode>,
  direction: Direction,
): Array<LexicalNode> | null {
  if (direction === 'down') {
    const next = nodes[nodes.length - 1].getNextSibling();
    if (next === null) {
      return null;
    }
    return $isListItemNode(next) && !$holdsNestedList(next)
      ? $itemWithNested(next)
      : [next];
  }
  const previous = nodes[0].getPreviousSibling();
  if (previous === null) {
    return null;
  }
  // A nested list moves with the item it belongs to.
  const owner = $holdsNestedList(previous)
    ? previous.getPreviousSibling()
    : null;
  return owner === null ? [previous] : [owner, previous];
}

/** Moves the selected block past its neighbor; false when nothing moved. */
function $moveSelectedBlock(direction: Direction): boolean {
  const nodes = $selectedMovable();
  const neighbor = nodes === null ? null : $neighborOf(nodes, direction);
  if (nodes === null || neighbor === null) {
    return false;
  }
  if (direction === 'up') {
    for (const node of nodes) {
      neighbor[0].insertBefore(node);
    }
  } else {
    let last = neighbor[neighbor.length - 1];
    for (const node of nodes) {
      last.insertAfter(node);
      last = node;
    }
  }
  return true;
}

function registerMoveBlock(editor: LexicalEditor): () => void {
  return editor.registerCommand(
    KEY_DOWN_COMMAND,
    event => {
      const direction = directionOf(event);
      if (direction === null || !editor.isEditable()) {
        return false;
      }
      // The shortcut is the editor's even where nothing can move, so the
      // caret does not jump instead.
      event.preventDefault();
      if ($moveSelectedBlock(direction)) {
        // Its own undo step, never merged with the edit before it.
        $addUpdateTag(HISTORY_PUSH_TAG);
      }
      return true;
    },
    COMMAND_PRIORITY_LOW,
  );
}

export function MoveBlockPlugin(): null {
  const [editor] = useLexicalComposerContext();
  useEffect(() => registerMoveBlock(editor), [editor]);
  return null;
}
