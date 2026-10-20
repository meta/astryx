// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file BlockDirectionPlugin.tsx
 * @input Uses @lexical/react (composer context), lexical's `getTextDirection`,
 *   and the top-level prose block classes.
 * @output Exports BlockDirectionPlugin, which gives each top-level prose block
 *   an explicit `dir` taken from its own text, and registerBlockDirection for
 *   a caller driving a Lexical editor directly.
 * @position Rendered by RichTextEditor and RichTextView inside the composer,
 *   so a document reads the same way in both.
 *
 * Lexical leaves a top-level block's `dir` as `auto`, and the HTML
 * directionality heuristic then reads its first strong character. That cannot
 * express "this block has no direction of its own": a block of digits, an
 * image or nothing at all resolves left-to-right, exactly like a block of
 * English, so a document cannot both let a Hebrew paragraph read
 * right-to-left and keep an empty paragraph's caret on a right-to-left
 * document's start edge (spec:AST-061 FR6).
 *
 * Writing the direction out resolves it. A prose block whose own text is
 * strongly directional gets `dir="ltr"` or `dir="rtl"` and reads that way
 * wherever it sits; a block with no strong character keeps `dir="auto"`,
 * which the editor theme styles as the surrounding document's direction.
 * Lexical serializes the value, so a stored document reopens the way it was
 * written, and `$setDirectionFromDOM` already preserves the same attribute
 * when HTML is pasted in.
 *
 * Only a block that is read as one piece of prose takes part. A list and a
 * fenced code block are several lines under one element, and one `dir` on
 * the element would impose the first line's direction on all of them —
 * turning `Buy milk.` into `.Buy milk` under a Hebrew first item. They keep
 * `dir="auto"`, under which the browser reads each line on its own, and the
 * theme gives the element the document's direction. A table is out for the
 * same kind of reason: its columns are read in the document's order (see
 * editorTheme.ts).
 *
 * SYNC: When modified, keep RichTextEditor.tsx and RichTextView.tsx in sync.
 */

import {useEffect} from 'react';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {mergeRegister} from '@lexical/utils';
import {HeadingNode, QuoteNode} from '@lexical/rich-text';
import {
  $getRoot,
  $isElementNode,
  getTextDirection,
  HISTORY_MERGE_TAG,
  ParagraphNode,
  TextNode,
  type ElementNode,
  type Klass,
  type LexicalEditor,
  type LexicalNode,
} from 'lexical';

/**
 * The top-level blocks read as one piece of prose, so one direction covers
 * the whole block. A list, a fenced code block and a table are not here:
 * they hold several lines or cells that are read on their own terms.
 */
const PROSE_BLOCKS: ReadonlyArray<Klass<ElementNode>> = [
  ParagraphNode,
  HeadingNode,
  QuoteNode,
];

/** Whether this node is a top-level prose block that carries its own `dir`. */
function $isOwnDirectionBlock(node: LexicalNode): node is ElementNode {
  return (
    $isElementNode(node) &&
    PROSE_BLOCKS.some(klass => node instanceof klass) &&
    node.getParent() === $getRoot()
  );
}

/** The direction this block's own text asks for; null when it has none. */
function $ownDirection(node: ElementNode): 'ltr' | 'rtl' | null {
  return getTextDirection(node.getTextContent());
}

/** Whether this block's `dir` already matches the text inside it. */
function $isSettled(node: LexicalNode): boolean {
  return (
    !$isOwnDirectionBlock(node) || node.getDirection() === $ownDirection(node)
  );
}

/** Writes a block's own direction onto it, if that is not what it says. */
function $writeOwnDirection(node: LexicalNode): void {
  if (!$isSettled(node)) {
    (node as ElementNode).setDirection($ownDirection(node as ElementNode));
  }
}

/**
 * Keeps every top-level prose block's `dir` equal to the direction of its own
 * text. Returns the usual teardown.
 */
export function registerBlockDirection(editor: LexicalEditor): () => void {
  return mergeRegister(
    // Typing inside an existing paragraph dirties its text node, not the
    // block, so the text node is where a keystroke can be caught. Running
    // here keeps the direction in the update that changed the text, and so
    // in that keystroke's own history entry: a later `editor.update` would
    // be a history step of its own, and undo would bounce off it forever.
    editor.registerNodeTransform(TextNode, node => {
      const block = node.getTopLevelElement();
      if (block !== null) {
        $writeOwnDirection(block);
      }
    }),
    // A block that gains or loses its text without a text node of its own
    // being dirtied — a new empty paragraph, a heading conversion, a
    // deletion that empties a block.
    ...PROSE_BLOCKS.map(klass =>
      editor.registerNodeTransform(klass, $writeOwnDirection),
    ),
    // Replacing the whole state runs no transform at all, and RichTextView
    // does exactly that whenever its `value` changes. Sweep the blocks when
    // one is left disagreeing with its text. The sweep merges into the
    // update that caused it rather than taking an undo step of its own, and
    // writing the direction settles the block, so this does not loop.
    editor.registerUpdateListener(({editorState}) => {
      const stale = editorState.read(() =>
        $getRoot().getChildren().some(node => !$isSettled(node)),
      );
      if (stale) {
        editor.update(
          () => {
            $getRoot().getChildren().forEach($writeOwnDirection);
          },
          {tag: HISTORY_MERGE_TAG},
        );
      }
    }),
  );
}

/**
 * Gives each top-level prose block an explicit `dir` taken from its own text,
 * so a strongly directional paragraph reads its own way in either document
 * and a block with no direction of its own follows the document.
 */
export function BlockDirectionPlugin(): null {
  const [editor] = useLexicalComposerContext();
  useEffect(() => registerBlockDirection(editor), [editor]);
  return null;
}
