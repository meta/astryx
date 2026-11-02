// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file BlockDirectionPlugin.tsx
 * @input Uses @lexical/react (composer context), lexical's `getTextDirection`,
 *   and the prose container classes.
 * @output Exports BlockDirectionPlugin, which gives each prose container an
 *   explicit `dir` taken from its own text, and registerBlockDirection for
 *   a caller driving a Lexical editor directly.
 * @position Rendered by RichTextEditor and RichTextView inside the composer,
 *   so a document reads the same way in both.
 *
 * Lexical leaves a top-level block's `dir` as `auto` and writes none at all
 * below that, so the HTML directionality heuristic reads a top-level block's
 * first strong character and everything deeper simply inherits the
 * document's direction. Neither can express "this block has no direction of
 * its own": under `dir="auto"` a block of digits, an image or nothing at all
 * resolves left-to-right, exactly like a block of English, so a document
 * cannot both let a Hebrew paragraph read right-to-left and keep an empty
 * paragraph's caret on a right-to-left document's start edge (spec:AST-061
 * FR6). And an English list item in a right-to-left document, with no `dir`
 * of its own, is a left-to-right run in a right-to-left box: it flushes
 * right and its arrow keys move the caret the wrong way.
 *
 * Writing the direction out resolves both. A prose container whose own text
 * is strongly directional gets `dir="ltr"` or `dir="rtl"` and reads that way
 * wherever it sits; one with no strong character is left alone, so it
 * follows the document. Lexical serializes the value, so a stored document
 * reopens the way it was written, and `$setDirectionFromDOM` already
 * preserves the same attribute when HTML is pasted in.
 *
 * Only a container read as one piece of prose takes part, and each one takes
 * part on its own: a paragraph, a heading, a quote, and a list item, at any
 * depth. A paragraph inside a table cell is prose too, so a cell of English
 * in a right-to-left document reads left-to-right.
 *
 * Their containers are not prose and keep `dir="auto"`, which the theme
 * styles as the document's direction: a list, whose markers and indent order
 * the items; a table, whose columns are read in the document's order; and a
 * fenced code block, which is several lines under one element, where the
 * theme sets `unicode-bidi: plaintext` so each line reads on its own. That
 * last one is the single place RichText and core `Markdown` disagree: core
 * reorders a whole code block to the document's direction.
 *
 * SYNC: When modified, keep RichTextEditor.tsx and RichTextView.tsx in sync.
 */

import {useEffect} from 'react';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {mergeRegister} from '@lexical/utils';
import {HeadingNode, QuoteNode} from '@lexical/rich-text';
import {$isListNode, ListItemNode, ListNode} from '@lexical/list';
import {CodeNode} from '@lexical/code';
import {TableCellNode, TableNode, TableRowNode} from '@lexical/table';
import {
  $getRoot,
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
 * whole of each. A list, a fenced code block and a table are not here: they
 * hold several items, lines or cells that are read on their own terms.
 */
const PROSE_NODES: ReadonlyArray<Klass<ElementNode>> = [
  ParagraphNode,
  HeadingNode,
  QuoteNode,
  ListItemNode,
];

/**
 * The containers, which order their contents in the document's direction and
 * so must never carry one of their own. A `dir` can still arrive on them from
 * pasted HTML (`$setDirectionFromDOM`) or an older stored document, which
 * would turn a list's markers or a table's columns around; clearing it keeps
 * the stored state saying what the document shows.
 */
const CONTAINER_NODES: ReadonlyArray<Klass<ElementNode>> = [
  ListNode,
  CodeNode,
  TableNode,
  TableRowNode,
  TableCellNode,
];

/** Whether this node is a prose container that carries its own `dir`. */
function $isOwnDirectionBlock(node: LexicalNode): node is ElementNode {
  if (!$isElementNode(node) || !PROSE_NODES.some(k => node instanceof k)) {
    return false;
  }
  // A list item that only holds a nested list is structure, not prose: its
  // text is its descendants' and belongs to each of them.
  return !node.getChildren().some($isListNode);
}

/**
 * The strongly right-to-left characters of UAX #9 — Bidi_Class `R` and `AL`.
 * Living scripts are named so the set reads as what it is; the two ranges
 * cover the historic right-to-left scripts in the Supplementary Multilingual
 * Plane (Phoenician, Kharoshthi, Old Hungarian, Mende Kikakui, …), which have
 * no settled script escapes across engines.
 *
 * Not `getTextDirection` from `lexical`: its left-to-right class spans
 * `\u2C00-\uFB1C`, which swallows the whole UTF-16 surrogate range, so every
 * character outside the Basic Multilingual Plane reads as strongly
 * left-to-right — `🎉 מזל טוב`, `👍 مرحبا` and all of Adlam come back `ltr`.
 * The same class spans `\u0800-\u1FFF`, which takes Samaritan and Mandaic
 * with it. A browser's own `dir="auto"` gets these right, so writing Lexical's
 * answer out would have been worse than leaving the attribute alone.
 */
const STRONG_RTL =
  /[\p{Script=Adlam}\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Mandaic}\p{Script=Nko}\p{Script=Samaritan}\p{Script=Syriac}\p{Script=Thaana}\u200F\u061C\u{10800}-\u{10FFF}\u{1E800}-\u{1EFFF}]/u;

/**
 * Bidi_Class `L`: any other letter, plus the left-to-right mark. Digits,
 * punctuation, emoji and other symbols are deliberately absent — UAX #9 P2
 * skips them, so `123 — מזל טוב` and `🎉 מזל טוב` both read right-to-left.
 */
const STRONG_LTR = /[\p{Letter}\u200E]/u;

/**
 * UAX #9 P2–P3: the direction of the first strongly directional character,
 * or null when the text has none. Iterating the string yields whole code
 * points, so a surrogate pair is classified as the character it encodes.
 */
export function firstStrongDirection(text: string): 'ltr' | 'rtl' | null {
  for (const character of text) {
    if (STRONG_RTL.test(character)) {
      return 'rtl';
    }
    if (STRONG_LTR.test(character)) {
      return 'ltr';
    }
  }
  return null;
}

/** The direction this container's own text asks for; null when it has none. */
function $ownDirection(node: ElementNode): 'ltr' | 'rtl' | null {
  return firstStrongDirection(node.getTextContent());
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

/** The nearest prose container at or above this node, if there is one. */
function $proseContainer(node: LexicalNode): ElementNode | null {
  for (
    let current: LexicalNode | null = node;
    current !== null;
    current = current.getParent()
  ) {
    if ($isOwnDirectionBlock(current)) {
      return current;
    }
  }
  return null;
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
      const container = $proseContainer(node);
      if (container !== null) {
        $writeOwnDirection(container);
      }
    }),
    // A container that gains or loses its text without a text node of its
    // own being dirtied — a new empty paragraph, a heading conversion, a
    // list item split, a deletion that empties a block.
    ...PROSE_NODES.map(klass =>
      editor.registerNodeTransform(klass, $writeOwnDirection),
    ),
    // A container that arrives carrying a direction — pasted HTML, or an
    // older stored document — gives it up, so its contents are ordered by
    // the document as they are everywhere else.
    ...CONTAINER_NODES.map(klass =>
      editor.registerNodeTransform(klass, $writeOwnDirection),
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
  useEffect(() => registerBlockDirection(editor), [editor]);
  return null;
}
