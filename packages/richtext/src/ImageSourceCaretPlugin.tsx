// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ImageSourceCaretPlugin.tsx
 * @input Uses @lexical/react (composer context) and lexical (selection, the
 *   selection-change and text-insertion commands, update listeners), and
 *   $isImageSource from markdownCharacterReferences.ts.
 * @output Exports ImageSourceCaretPlugin, which keeps a collapsed caret out
 *   of the text that holds an image's Markdown source.
 * @position Rendered by RichTextEditor, always on. An image's source is one
 *   token, and Lexical replaces a whole token with the text a person types
 *   inside it. A caret that lands inside one moves to an edge instead: on
 *   through the token when an arrow key moved it in from an edge, and to the
 *   nearer edge when a click or another move put it there. Typing then adds
 *   text beside the image, and the image's source stays as written.
 */

import {useEffect} from 'react';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_CRITICAL,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  SELECTION_CHANGE_COMMAND,
  type LexicalEditor,
  type NodeKey,
  type TextNode,
} from 'lexical';
import {$isImageSource} from './markdownCharacterReferences';

interface CaretPoint {
  readonly key: NodeKey;
  readonly offset: number;
}

/**
 * The edge of `token` a caret at `offset` inside it moves to. A caret that
 * was at one edge of the token, or at the end of the text just before it or
 * the start of the text just after it, moves on to the other edge.
 */
function $edgeFor(
  token: TextNode,
  offset: number,
  previous: CaretPoint | null,
): number {
  const size = token.getTextContentSize();
  const nearer = offset < size / 2 ? 0 : size;
  if (previous == null) {
    return nearer;
  }
  if (previous.key === token.getKey()) {
    return previous.offset === 0 ? size : previous.offset === size ? 0 : nearer;
  }
  const before = token.getPreviousSibling();
  if (
    before != null &&
    before.getKey() === previous.key &&
    previous.offset === before.getTextContentSize()
  ) {
    return size;
  }
  const after = token.getNextSibling();
  if (
    after != null &&
    after.getKey() === previous.key &&
    previous.offset === 0
  ) {
    return 0;
  }
  return nearer;
}

/**
 * Moves a collapsed caret inside an image's source to an edge of it. Always
 * returns false, so the command goes on to Lexical's own handler.
 */
function $moveCaretOutOfImage(previous: CaretPoint | null): false {
  const selection = $getSelection();
  if (
    !$isRangeSelection(selection) ||
    !selection.isCollapsed() ||
    selection.anchor.type !== 'text'
  ) {
    return false;
  }
  const {key, offset} = selection.anchor;
  const node = $getNodeByKey<TextNode>(key);
  if (
    node == null ||
    !$isImageSource(node) ||
    offset === 0 ||
    offset === node.getTextContentSize()
  ) {
    return false;
  }
  const edge = $edgeFor(node, offset, previous);
  selection.anchor.set(key, edge, 'text');
  selection.focus.set(key, edge, 'text');
  return false;
}

function registerImageSourceCaret(editor: LexicalEditor): () => void {
  let previous: CaretPoint | null = null;
  const removeSelectionChange = editor.registerCommand(
    SELECTION_CHANGE_COMMAND,
    () => $moveCaretOutOfImage(previous),
    COMMAND_PRIORITY_CRITICAL,
  );
  // A key typed before the browser reports the caret's move reaches the
  // editor with the caret still inside the source: move it there too.
  const removeInsertion = editor.registerCommand(
    CONTROLLED_TEXT_INSERTION_COMMAND,
    () => $moveCaretOutOfImage(previous),
    COMMAND_PRIORITY_CRITICAL,
  );
  const removeListener = editor.registerUpdateListener(({editorState}) => {
    previous = editorState.read(() => {
      const selection = $getSelection();
      return $isRangeSelection(selection) &&
        selection.isCollapsed() &&
        selection.anchor.type === 'text'
        ? {key: selection.anchor.key, offset: selection.anchor.offset}
        : null;
    });
  });
  return () => {
    removeSelectionChange();
    removeInsertion();
    removeListener();
  };
}

/** Keeps a collapsed caret out of the text holding an image's source. */
export function ImageSourceCaretPlugin(): null {
  const [editor] = useLexicalComposerContext();
  useEffect(() => registerImageSourceCaret(editor), [editor]);
  return null;
}
