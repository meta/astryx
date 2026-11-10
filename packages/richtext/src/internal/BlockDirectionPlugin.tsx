// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file BlockDirectionPlugin.tsx
 * @input Uses @lexical/react (composer context) and the prose container
 *   classes, and classifies text with core's `firstStrongDirection`.
 * @output Exports BlockDirectionPlugin, which gives each prose container an
 *   explicit `dir` taken from its own text, and registerBlockDirection for
 *   a caller driving a Lexical editor directly.
 * @position Rendered by RichTextEditor and RichTextView inside the composer,
 *   so a document reads the same way in both.
 *
 * SYNC: When modified, keep RichTextEditor.tsx and RichTextView.tsx in sync.
 */

import {useEffect} from 'react';
import {firstStrongDirection} from '@astryxdesign/core/i18n';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {mergeRegister} from '@lexical/utils';
import {HeadingNode, QuoteNode} from '@lexical/rich-text';
import {
  $isListItemNode,
  $isListNode,
  ListItemNode,
  ListNode,
} from '@lexical/list';
import {CodeNode} from '@lexical/code';
import {TableCellNode, TableNode, TableRowNode} from '@lexical/table';
import {
  $getRoot,
  $isDecoratorNode,
  $isElementNode,
  HISTORY_MERGE_TAG,
  ParagraphNode,
  TextNode,
  type ElementNode,
  type Klass,
  type LexicalEditor,
  type LexicalNode,
} from 'lexical';

/**
 * The containers read as one piece of prose, so one direction covers the
 * whole of each, at any depth — a paragraph inside a table cell included.
 *
 * Lexical leaves a top-level block at `dir="auto"` and writes none below
 * that, and neither state can say "this block has no direction of its own":
 * under `auto`, digits, an image and an empty block all resolve
 * left-to-right, exactly like English. Writing the direction out separates
 * the two, and Lexical serializes it, so a stored document reopens the way
 * it was written.
 *
 * A list, a fenced code block and a table are not here: they hold several
 * items, lines or cells that are read on their own terms.
 */
const PROSE_NODES: ReadonlyArray<Klass<ElementNode>> = [
  ParagraphNode,
  HeadingNode,
  QuoteNode,
  ListItemNode,
];

/**
 * The containers. They take their parent's direction from the theme whatever
 * `dir` says, so an arriving one changes no pixels. It can still arrive from
 * pasted HTML (`$setDirectionFromDOM`) or an older stored document; clearing
 * it keeps the stored state saying what the document shows.
 *
 * A fenced code block is the one place this surface and core `Markdown`
 * disagree: the theme gives it `unicode-bidi: plaintext` so each line reads
 * its own way, where core reorders the whole block to the document's.
 */
const CONTAINER_NODES: ReadonlyArray<Klass<ElementNode>> = [
  ListNode,
  CodeNode,
  TableNode,
  TableRowNode,
  TableCellNode,
];

/**
 * Whether this node is a prose container that carries its own `dir`.
 *
 * A list item holding a nested list takes one too, from the text of
 * everything under it. The nesting step is an inline margin on the item, so
 * it resolves against that item's own direction: left at `auto` it puts the
 * step on the document's side while the items inside start on theirs, and
 * every level of an English list in a right-to-left document then begins at
 * the same edge, with only the marker shape showing the depth.
 */
function $isOwnDirectionBlock(node: LexicalNode): node is ElementNode {
  return $isElementNode(node) && PROSE_NODES.some(k => node instanceof k);
}

/**
 * The direction this container's own text asks for; null when it has none.
 *
 * Only text a reader reads counts. A decorator — an image, a chart, an
 * embed — shows no prose of its own, and `getTextContent` gives its
 * alternative text, so a picture captioned in English would turn a Hebrew
 * item left-to-right. Core Markdown skips the same nodes when it reads a
 * block's direction. A fenced code block is skipped for its own reason:
 * each of its lines reads on its own terms.
 *
 * Lexical puts a nested list in an item of its own after the item it hangs
 * from. That holder shows no text and is not a block a reader sees: it
 * belongs to the item above it, and a nested list is anchored on its parent
 * item's text start. So it takes that item's direction, not the direction of
 * the list inside it. Reading its own contents instead would anchor the
 * nested list on whichever language its first item happened to use, which
 * costs an item that reads the other way its nesting step, and leaves a
 * neutral item — digits, an image — following that first item rather than
 * the document.
 */
function $ownDirection(node: ElementNode): 'ltr' | 'rtl' | null {
  const holds = $heldList(node);
  if (holds !== null) {
    const parentItem = $parentItemOf(node);
    return parentItem === null ? null : $ownDirection(parentItem);
  }
  return firstStrongDirection($proseText(node));
}

/** The list a holder item exists to carry, or null when it carries prose. */
function $heldList(node: ElementNode): ElementNode | null {
  if (!$isListItemNode(node)) {
    return null;
  }
  const children = node.getChildren();
  const lists = children.filter($isListNode);
  return lists.length === 1 && children.length === lists.length
    ? lists[0]
    : null;
}

/** The item a holder hangs from: the nearest prose item before it. */
function $parentItemOf(node: ElementNode): ElementNode | null {
  let sibling = node.getPreviousSibling();
  while (sibling !== null) {
    if ($isListItemNode(sibling) && $heldList(sibling) === null) {
      return sibling;
    }
    sibling = sibling.getPreviousSibling();
  }
  return null;
}

/** The text of a node's prose descendants, decorators and code aside. */
function $proseText(node: ElementNode): string {
  let text = '';
  for (const child of node.getChildren()) {
    if ($isDecoratorNode(child) || child instanceof CodeNode) {
      continue;
    }
    text += $isElementNode(child) ? $proseText(child) : child.getTextContent();
    if (firstStrongDirection(text) !== null) {
      break;
    }
  }
  return text;
}

/** Whether this node is a container, which carries no direction of its own. */
function $isContainer(node: LexicalNode): node is ElementNode {
  return (
    $isElementNode(node) && CONTAINER_NODES.some(klass => node instanceof klass)
  );
}

/** The direction this node should carry: its text's, or none at all. */
function $wantedDirection(node: LexicalNode): 'ltr' | 'rtl' | null {
  return $isOwnDirectionBlock(node) ? $ownDirection(node) : null;
}

/** Whether this node's `dir` is already what it should be. */
function $isSettled(node: LexicalNode): boolean {
  if (!$isOwnDirectionBlock(node) && !$isContainer(node)) {
    return true;
  }
  return (node as ElementNode).getDirection() === $wantedDirection(node);
}

/** Writes a node's direction onto it, if that is not what it says. */
function $writeOwnDirection(node: LexicalNode): void {
  if (!$isSettled(node)) {
    (node as ElementNode).setDirection($wantedDirection(node));
  }
}

/**
 * Every prose container at or above this node, nearest first.
 *
 * A nesting wrapper takes its direction from the text under it, so a
 * keystroke deep in a list changes its own item and every wrapper above it.
 * All of them have to be written inside the keystroke's own update: the
 * sweep that follows is tagged `history-merge`, which `OnChangePlugin`
 * does not report, so a wrapper left to the sweep would hold a stale
 * direction in the value a caller stores until the next edit.
 */
function $proseContainers(node: LexicalNode): ElementNode[] {
  const found: ElementNode[] = [];
  for (
    let current: LexicalNode | null = node;
    current !== null;
    current = current.getParent()
  ) {
    if ($isOwnDirectionBlock(current)) {
      found.push(current);
    }
  }
  return found;
}

/** Every node whose direction this plugin owns, in document order. */
function $allProseContainers(): ElementNode[] {
  const found: ElementNode[] = [];
  const visit = (node: LexicalNode): void => {
    if ($isOwnDirectionBlock(node) || $isContainer(node)) {
      found.push(node as ElementNode);
    }
    if ($isElementNode(node)) {
      node.getChildren().forEach(visit);
    }
  };
  $getRoot().getChildren().forEach(visit);
  return found;
}

/**
 * Keeps every prose container's `dir` equal to the direction of its own
 * text. Returns the usual teardown.
 */
export function registerBlockDirection(editor: LexicalEditor): () => void {
  return mergeRegister(
    // Typing inside an existing paragraph dirties its text node, not the
    // container, so the text node is where a keystroke can be caught.
    // Running here keeps the direction in the update that changed the text,
    // and so in that keystroke's own history entry: a later `editor.update`
    // would be a history step of its own, and undo would bounce off it.
    editor.registerNodeTransform(TextNode, node => {
      $proseContainers(node).forEach($writeOwnDirection);
    }),
    // A container that gains or loses its text without a text node of its
    // own being dirtied — a new empty paragraph, a heading conversion, a
    // list item split, a deletion that empties a block.
    ...PROSE_NODES.map(klass =>
      editor.registerNodeTransform(klass, node => {
        $proseContainers(node).forEach($writeOwnDirection);
      }),
    ),
    // A container that arrives carrying a direction — pasted HTML, or an
    // older stored document — gives it up, so its contents are ordered by
    // the document as they are everywhere else. Removing a node dirties its
    // parent, so a removed list item reaches its list here; the walk settles
    // the wrapper above it in the same update, which the sweep below would
    // otherwise do a history step later.
    ...CONTAINER_NODES.map(klass =>
      editor.registerNodeTransform(klass, node => {
        $writeOwnDirection(node);
        $proseContainers(node).forEach($writeOwnDirection);
      }),
    ),
    // Replacing the whole state runs no transform at all, and RichTextView
    // does exactly that whenever its `value` changes. Sweep the document
    // when a container is left disagreeing with its text. The sweep merges
    // into the update that caused it rather than taking an undo step of its
    // own, and writing the direction settles the container, so this does
    // not loop.
    editor.registerUpdateListener(({editorState}) => {
      const stale = editorState.read(() =>
        $allProseContainers().some(node => !$isSettled(node)),
      );
      if (stale) {
        editor.update(
          () => {
            $allProseContainers().forEach($writeOwnDirection);
          },
          {tag: HISTORY_MERGE_TAG},
        );
      }
    }),
  );
}

/**
 * Gives each prose container — paragraph, heading, quote, list item, at any
 * depth — an explicit `dir` taken from its own text, so a strongly
 * directional one reads its own way in either document and one with no
 * direction of its own follows the document.
 */
export function BlockDirectionPlugin(): null {
  const [editor] = useLexicalComposerContext();
  // Registers the direction transforms and listener on the Lexical editor.
  // The teardown removes them.
  useEffect(() => registerBlockDirection(editor), [editor]);
  return null;
}
