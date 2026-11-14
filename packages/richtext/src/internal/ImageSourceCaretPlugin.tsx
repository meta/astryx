// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ImageSourceCaretPlugin.tsx
 * @input Uses @lexical/react (composer context), lexical (selection, the
 *   selection-change and text-insertion commands, the root element), and
 *   $isImageSource from markdownCharacterReferences.ts.
 * @output Exports ImageSourceCaretPlugin.
 * @position Rendered by RichTextEditor, always on. Lexical replaces a whole
 *   token with text typed inside it. So a caret inside an image's source
 *   moves to an edge: past the image for an arrow key, to the nearer edge
 *   for a click or any other move.
 */

import {useEffect} from 'react';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {mergeRegister} from '@lexical/utils';
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
import {$isImageSource} from '../markdownCharacterReferences';

interface CaretPoint {
  readonly key: NodeKey;
  readonly offset: number;
}

/** The collapsed caret, when it is in text. */
function $caretPoint(): CaretPoint | null {
  const selection = $getSelection();
  return $isRangeSelection(selection) &&
    selection.isCollapsed() &&
    selection.anchor.type === 'text'
    ? {key: selection.anchor.key, offset: selection.anchor.offset}
    : null;
}

/**
 * The edge of `token` a caret at `offset` inside it moves to. An arrow key
 * that moved the caret in from one edge, or from the text beside it, moves
 * it on to the other edge.
 */
function $edgeFor(
  token: TextNode,
  offset: number,
  arrowFrom: CaretPoint | null,
): number {
  const size = token.getTextContentSize();
  const nearer = offset < size / 2 ? 0 : size;
  if (arrowFrom == null) {
    return nearer;
  }
  if (arrowFrom.key === token.getKey()) {
    return arrowFrom.offset === 0
      ? size
      : arrowFrom.offset === size
        ? 0
        : nearer;
  }
  const before = token.getPreviousSibling();
  if (
    before != null &&
    before.getKey() === arrowFrom.key &&
    arrowFrom.offset === before.getTextContentSize()
  ) {
    return size;
  }
  const after = token.getNextSibling();
  if (
    after != null &&
    after.getKey() === arrowFrom.key &&
    arrowFrom.offset === 0
  ) {
    return 0;
  }
  return nearer;
}

/** Moves a collapsed caret inside an image's source to an edge of it. */
function $moveCaretOutOfImage(arrowFrom: CaretPoint | null): void {
  const caret = $caretPoint();
  if (caret == null) {
    return;
  }
  const node = $getNodeByKey<TextNode>(caret.key);
  if (
    node == null ||
    !$isImageSource(node) ||
    caret.offset === 0 ||
    caret.offset === node.getTextContentSize()
  ) {
    return;
  }
  const edge = $edgeFor(node, caret.offset, arrowFrom);
  const selection = $getSelection();
  if ($isRangeSelection(selection)) {
    selection.anchor.set(caret.key, edge, 'text');
    selection.focus.set(caret.key, edge, 'text');
  }
}

function registerImageSourceCaret(editor: LexicalEditor): () => void {
  // Where the caret was when an arrow key went down; the next selection
  // change reads it once. A press is a click, never an arrow key.
  let arrowFrom: CaretPoint | null = null;
  const onKeyDown = (event: KeyboardEvent) => {
    arrowFrom =
      event.key === 'ArrowLeft' || event.key === 'ArrowRight'
        ? editor.getEditorState().read($caretPoint)
        : null;
  };
  const onPointerDown = () => {
    arrowFrom = null;
  };
  return mergeRegister(
    editor.registerRootListener((root, previousRoot) => {
      previousRoot?.removeEventListener('keydown', onKeyDown, true);
      previousRoot?.removeEventListener('pointerdown', onPointerDown, true);
      root?.addEventListener('keydown', onKeyDown, true);
      root?.addEventListener('pointerdown', onPointerDown, true);
    }),
    editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        $moveCaretOutOfImage(arrowFrom);
        arrowFrom = null;
        return false;
      },
      COMMAND_PRIORITY_CRITICAL,
    ),
    // A key typed before the browser reports a caret move reaches the editor
    // with the caret still inside the source.
    editor.registerCommand(
      CONTROLLED_TEXT_INSERTION_COMMAND,
      () => {
        $moveCaretOutOfImage(null);
        return false;
      },
      COMMAND_PRIORITY_CRITICAL,
    ),
  );
}

/** Keeps a collapsed caret out of the text holding an image's source. */
export function ImageSourceCaretPlugin(): null {
  const [editor] = useLexicalComposerContext();
  useEffect(() => registerImageSourceCaret(editor), [editor]);
  return null;
}
