// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file BlockDirectionPlugin.tsx
 * @input Uses @lexical/react (composer context) and the prose container
 *   classes, and classifies text with `firstStrongDirection` below.
 * @output Exports BlockDirectionPlugin, which gives each prose container an
 *   explicit `dir` taken from its own text, and registerBlockDirection for
 *   a caller driving a Lexical editor directly.
 * @position Rendered by RichTextEditor and RichTextView inside the composer,
 *   so a document reads the same way in both.
 *
 * SYNC: When modified, keep RichTextEditor.tsx and RichTextView.tsx in sync.
 */

import {useEffect} from 'react';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {mergeRegister} from '@lexical/utils';
import {HeadingNode, QuoteNode} from '@lexical/rich-text';
import {ListItemNode, ListNode} from '@lexical/list';
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
 * The strongly right-to-left characters of the Unicode Bidirectional
 * Algorithm — Bidi_Class `R` and `AL`.
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
 * The Arabic script's weak characters: its digits and their extended forms,
 * the number signs that introduce them, and the currency and per-cent marks
 * that sit beside them. All are Bidi_Class `AN`, `EN` or `ET` — weak, not
 * strong — so the first-strong scan passes over them and `۱۴۰۳ Annual
 * report` and `٪50 off` both read left-to-right.
 *
 * Not every right-to-left digit is weak: NKo's (`U+07C0`–`U+07C9`) and
 * Adlam's (`U+1E950`–`U+1E959`) are Bidi_Class `R`, so they are deliberately
 * absent here and a block opening with one reads right-to-left.
 */
const WEAK_ARABIC_NUMBER =
  /[\u0600-\u0605\u0609\u060A\u0660-\u0669\u066A-\u066C\u06DD\u06F0-\u06F9\u0890\u0891\u08E2]/u;

/**
 * Bidi_Class `L`: any other letter, the letter numbers (Roman numeral `Ⅰ`
 * and its kind, which `\p{Letter}` does not cover), and the left-to-right
 * mark. Digits, punctuation, emoji and other symbols are deliberately
 * absent: the algorithm's P2 rule skips them, so `123 — מזל טוב` and
 * `🎉 מזל טוב` both read right-to-left.
 */
const STRONG_LTR = /[\p{Letter}\p{Nl}\u200E]/u;

/**
 * Bidi_Class `NSM`: a combining mark takes the direction of the character it
 * sits on and is never strong itself. A mark carries its base letter's
 * script, so `\p{Script=Hebrew}` matches Hebrew points and `\p{Script=Arabic}`
 * matches harakat; without this the scan would stop on a leading vowel point
 * and read `ְAnnual report` as right-to-left.
 */
const COMBINING_MARK = /\p{Mark}/u;

/**
 * P2 and P3 of that algorithm: the direction of the first strongly
 * directional character,
 * or null when the text has none. Iterating the string yields whole code
 * points, so a surrogate pair is classified as the character it encodes.
 */
export function firstStrongDirection(text: string): 'ltr' | 'rtl' | null {
  for (const character of text) {
    if (COMBINING_MARK.test(character) || WEAK_ARABIC_NUMBER.test(character)) {
      continue;
    }
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
  // Registers the direction transforms and listener on the Lexical editor.
  // The teardown removes them.
  useEffect(() => registerBlockDirection(editor), [editor]);
  return null;
}
