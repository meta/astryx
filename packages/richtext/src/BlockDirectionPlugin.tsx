// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file BlockDirectionPlugin.tsx
 * @input Uses @lexical/react (composer context), lexical's `getTextDirection`,
 *   and the block node classes that can sit at the top level.
 * @output Exports BlockDirectionPlugin, which gives each top-level block an
 *   explicit `dir` taken from its own text, and registerBlockDirection for a
 *   caller driving a Lexical editor directly.
 * @position Rendered by RichTextEditor and RichTextView inside the composer,
 *   so a document reads the same way in both.
 *
 * Lexical leaves a top-level block's `dir` as `auto`, and the HTML
 * directionality heuristic then reads its first strong character. That
 * cannot express "this block has no direction of its own": a block of
 * digits, punctuation, an image or nothing at all resolves left-to-right,
 * exactly like a block of English, so a document cannot both let a Hebrew
 * paragraph read right-to-left and keep an empty paragraph's caret on a
 * right-to-left document's start edge (spec:AST-061 FR6).
 *
 * Writing the direction out resolves it. A block whose own text is strongly
 * directional gets `dir="ltr"` or `dir="rtl"` and reads that way wherever it
 * sits; a block with no strong character keeps `dir="auto"`, which the
 * editor theme styles as the surrounding document's direction. Lexical
 * serializes the value, so a stored document reopens the way it was written,
 * and `$setDirectionFromDOM` already preserves the same attribute when HTML
 * is pasted in.
 *
 * A table is exempt: its columns are read in the document's order, whatever
 * the cells hold, so no direction is written to it (see editorTheme.ts).
 *
 * SYNC: When modified, keep RichTextEditor.tsx and RichTextView.tsx in sync.
 */

import {useEffect} from 'react';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {mergeRegister} from '@lexical/utils';
import {HeadingNode, QuoteNode} from '@lexical/rich-text';
import {ListNode} from '@lexical/list';
import {CodeNode} from '@lexical/code';
import {
  $getRoot,
  $isElementNode,
  ParagraphNode,
  getTextDirection,
  type ElementNode,
  type Klass,
  type LexicalEditor,
  type LexicalNode,
} from 'lexical';

/**
 * The block classes that carry prose at the top level. A table is not here:
 * it keeps the document's direction so its columns keep their order.
 */
const TEXT_BLOCKS: ReadonlyArray<Klass<ElementNode>> = [
  ParagraphNode,
  HeadingNode,
  QuoteNode,
  ListNode,
  CodeNode,
];

/** Whether this node is a top-level block that should carry its own `dir`. */
function $isOwnDirectionBlock(node: LexicalNode): node is ElementNode {
  return (
    $isElementNode(node) &&
    TEXT_BLOCKS.some(klass => node instanceof klass) &&
    node.getParent() === $getRoot()
  );
}

/** The direction this block's own text asks for; null when it has none. */
function $ownDirection(node: ElementNode): 'ltr' | 'rtl' | null {
  return getTextDirection(node.getTextContent());
}

/** Writes a block's own direction onto it, if that is not what it says. */
function $writeOwnDirection(node: LexicalNode): void {
  if (!$isOwnDirectionBlock(node)) {
    return;
  }
  const own = $ownDirection(node);
  if (node.getDirection() !== own) {
    node.setDirection(own);
  }
}

/**
 * Keeps every top-level block's `dir` equal to the direction of its own
 * text. Returns the usual teardown.
 */
export function registerBlockDirection(editor: LexicalEditor): () => void {
  return mergeRegister(
    ...TEXT_BLOCKS.map(klass =>
      editor.registerNodeTransform(klass, $writeOwnDirection),
    ),
    // A transform runs over the nodes an update dirtied. Replacing the whole
    // state does not dirty them one by one — RichTextView does exactly that
    // whenever its `value` changes — so the blocks are swept once after any
    // update that left one disagreeing with its text. Writing the direction
    // settles them, so the next pass finds nothing and this does not loop.
    editor.registerUpdateListener(({editorState}) => {
      const stale = editorState.read(() =>
        $getRoot()
          .getChildren()
          .some(
            node =>
              $isOwnDirectionBlock(node) &&
              node.getDirection() !== $ownDirection(node),
          ),
      );
      if (stale) {
        editor.update(() => {
          $getRoot().getChildren().forEach($writeOwnDirection);
        });
      }
    }),
  );
}

/**
 * Gives each top-level block an explicit `dir` taken from its own text, so a
 * strongly directional paragraph reads its own way in either document and a
 * block with no direction of its own follows the document.
 */
export function BlockDirectionPlugin(): null {
  const [editor] = useLexicalComposerContext();
  useEffect(() => registerBlockDirection(editor), [editor]);
  return null;
}
