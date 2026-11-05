// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file CodeSyntaxPlugin.tsx
 * @input Uses @lexical/react (composer context), @lexical/code (CodeNode),
 *   lexical, core CodeBlock's highlight styles and token types, and
 *   CodeLineTokens (codeLineTokens.ts), core CodeBlock's tokens kept line by
 *   line.
 * @output Exports CodeSyntaxPlugin, which colors the code in every fenced code
 *   block with core CodeBlock's tokenizer and syntax color tokens; and
 *   CODE_SYNTAX_CLASS, the class the theme gives code blocks for it.
 * @position Rendered by RichTextEditor and RichTextView. A fenced code block
 *   with a language core CodeBlock knows is colored as core Markdown colors
 *   it: the same tokenizer finds the same tokens, and each token type takes
 *   its `--color-syntax-*` token (spec:AST-061 FR1) — no palette of its own.
 *   The colors are CSS Custom Highlight ranges over the text Lexical renders,
 *   the way core CodeBlock colors editable code, so the document and its DOM
 *   are untouched. A block is colored in full when it appears, or when its
 *   language, its element, or its set of text nodes changes. An edit that
 *   only rewrites one text node's text re-tokenizes just the lines
 *   CodeLineTokens says it can change, and replaces only the ranges in that
 *   text node, reading no other. Browsers without the Highlight API show
 *   plain code.
 */

import {useEffect, useState} from 'react';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {$isCodeNode, CodeNode} from '@lexical/code';
import {
  $getNodeByKey,
  $isTextNode,
  type LexicalEditor,
  type NodeKey,
  type NodeMutation,
} from 'lexical';
import {
  ensureHighlightStyles,
  TOKEN_TYPES,
  type CodeLanguage,
} from '@astryxdesign/core/CodeBlock';
import {listedLanguage, sameLanguages} from './codeLanguages';
import {CodeLineTokens} from './codeLineTokens';

/** The class the theme adds to every code block (editorTheme.ts). */
export const CODE_SYNTAX_CLASS = 'astryx-richtext-code';

let hasInjectedRules = false;

/**
 * The highlight rules for code blocks, injected once: each token type takes
 * the same syntax color token core CodeBlock's rules use.
 */
function ensureRules(): void {
  if (hasInjectedRules || typeof document === 'undefined') {
    return;
  }
  hasInjectedRules = true;
  const style = document.createElement('style');
  style.setAttribute('data-astryx-richtext-code-syntax', '');
  style.textContent = TOKEN_TYPES.map(
    type =>
      `.${CODE_SYNTAX_CLASS}::highlight(astryx-${type}) { color: var(--color-syntax-${type}); }`,
  ).join('\n');
  document.head.append(style);
}

function supportsHighlights(): boolean {
  return (
    typeof CSS !== 'undefined' &&
    'highlights' in CSS &&
    typeof Highlight !== 'undefined'
  );
}

/** A colored token: its range, and the highlight that holds it. */
interface Painted {
  readonly range: Range;
  readonly highlight: Highlight;
}

/**
 * A colored code block, with what an edit needs to recolor part of it.
 * Offsets in the rendered text are offsets in the block's DOM text nodes
 * laid end to end, which is the code itself when its line breaks render as
 * text, and the code without them when each renders as an element (`flat`).
 */
interface Colored {
  readonly element: HTMLElement;
  readonly language: string;
  readonly lines: CodeLineTokens;
  readonly flat: boolean;
  /** The block's DOM text nodes in order. */
  readonly texts: Text[];
  /** Where each DOM text node starts in the rendered text. */
  readonly starts: number[];
  /** Where each leaf's DOM text node starts in the code (NaN for others). */
  readonly codeStarts: number[];
  /** The rendered text's length. */
  length: number;
  /** The Lexical text nodes that render as one DOM text node each, by key:
   *  that node's index in `texts`, and the text last colored. */
  readonly leaves: Map<NodeKey, {readonly index: number; text: string}>;
  /** Each line's colored tokens. */
  ranges: Painted[][];
}

function highlightFor(type: string): Highlight {
  const name = `astryx-${type}`;
  let highlight = CSS.highlights.get(name);
  if (highlight == null) {
    highlight = new Highlight();
    CSS.highlights.set(name, highlight);
  }
  return highlight;
}

/**
 * The DOM position of `offset` in a block's rendered text: in the text node
 * that holds the character there when `inside`, else in the first text node
 * that reaches it. Null past the end of the text.
 */
function pointAt(
  block: Colored,
  offset: number,
  inside: boolean,
): [Text, number] | null {
  const {texts, starts, length} = block;
  if (texts.length === 0 || offset > length) {
    return null;
  }
  let low = 0;
  let high = texts.length - 1;
  while (low < high) {
    const mid = (low + high) >>> 1;
    const end = mid + 1 < texts.length ? starts[mid + 1] : length;
    if (inside ? end > offset : end >= offset) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }
  return [texts[low], offset - starts[low]];
}

/** Colors one line's tokens. */
function paintLine(block: Colored, line: number): void {
  // A flat block's rendered text has no line breaks before this line.
  const base = block.lines.starts[line] - (block.flat ? line : 0);
  const painted: Painted[] = [];
  for (const token of block.lines.tokens[line] ?? []) {
    const start = base + token.start;
    const end = base + token.end;
    const from = pointAt(block, start, start < end);
    const to = pointAt(block, end, false);
    if (from == null || to == null) {
      continue;
    }
    const highlight = highlightFor(token.type);
    try {
      const range = new Range();
      range.setStart(...from);
      range.setEnd(...to);
      highlight.add(range);
      painted.push({range, highlight});
    } catch {
      // A range the DOM refuses colors nothing.
    }
  }
  block.ranges[line] = painted;
}

function unpaintLine(block: Colored, line: number): void {
  for (const {range, highlight} of block.ranges[line] ?? []) {
    highlight.delete(range);
  }
  block.ranges[line] = [];
}

function unpaintAll(block: Colored): void {
  for (let line = 0; line < block.ranges.length; line++) {
    unpaintLine(block, line);
  }
  block.ranges = [];
}

function repaintAll(block: Colored): void {
  unpaintAll(block);
  for (let line = 0; line < block.lines.tokens.length; line++) {
    paintLine(block, line);
  }
}

/**
 * Lists a block's DOM text nodes in order with their offsets, and the
 * Lexical text nodes that render as exactly one of them.
 */
function $indexText(
  editor: LexicalEditor,
  node: CodeNode,
  block: Colored,
): void {
  const walker = document.createTreeWalker(block.element, NodeFilter.SHOW_TEXT);
  while (walker.nextNode() != null) {
    const text = walker.currentNode as Text;
    block.texts.push(text);
    block.starts.push(block.length);
    block.codeStarts.push(NaN);
    block.length += text.length;
  }
  const indexes = new Map(block.texts.map((text, index) => [text, index]));
  let codeStart = 0;
  for (const child of node.getChildren()) {
    const dom = $isTextNode(child)
      ? editor.getElementByKey(child.getKey())
      : null;
    const index =
      dom?.childNodes.length === 1
        ? indexes.get(dom.firstChild as Text)
        : undefined;
    if (index != null) {
      block.leaves.set(child.getKey(), {index, text: child.getTextContent()});
      block.codeStarts[index] = codeStart;
    }
    codeStart += child.getTextContentSize();
  }
}

/** The key of the code block that holds the node `key`, if any. */
function $codeBlockOf(key: NodeKey): NodeKey | null {
  let node = $getNodeByKey(key)?.getParent() ?? null;
  while (node != null && !$isCodeNode(node)) {
    node = node.getParent();
  }
  return node?.getKey() ?? null;
}

export function CodeSyntaxPlugin({
  codeLanguages,
}: {
  /** Language values a fence may name (component:Markdown FR30). */
  codeLanguages?: ReadonlyArray<CodeLanguage>;
} = {}): null {
  const [editor] = useLexicalComposerContext();
  // Keep one list while it names the same values, so an inline
  // `codeLanguages={[…]}` does not re-colour every block on each parent
  // render (adjusting state during render, not in an Effect).
  const [languages, setLanguages] = useState(codeLanguages);
  if (!sameLanguages(languages, codeLanguages)) {
    setLanguages(codeLanguages);
  }

  // Synchronizes the editor's code blocks with the CSS highlight registry:
  // Lexical mutation and update listeners colour each block, and the cleanup
  // removes the listeners and every highlight range they added.
  useEffect(() => {
    if (!supportsHighlights()) {
      return undefined;
    }
    ensureRules();
    // Every code block in the editor, the ones colored, and the ones colored
    // in full during the current update.
    const blocks = new Set<NodeKey>();
    const colored = new Map<NodeKey, Colored>();
    const repainted = new Set<NodeKey>();
    const uncolor = (key: NodeKey) => {
      const block = colored.get(key);
      if (block != null) {
        unpaintAll(block);
        colored.delete(key);
      }
    };
    // Colors a block in full, unless `force` is false and its element,
    // language, and code are as last colored.
    const $color = (key: NodeKey, force: boolean) => {
      const node = $getNodeByKey(key);
      const element = editor.getElementByKey(key);
      if (!$isCodeNode(node) || element == null) {
        uncolor(key);
        return;
      }
      const code = node.getTextContent();
      const language = node.getLanguage() ?? '';
      const previous = colored.get(key);
      if (
        !force &&
        previous != null &&
        previous.element === element &&
        previous.language === language &&
        previous.lines.text === code
      ) {
        return;
      }
      uncolor(key);
      const rendered = element.textContent ?? '';
      if (rendered !== code && rendered !== code.replaceAll('\n', '')) {
        // Not rendered yet; the block's next change tries again.
        return;
      }
      ensureHighlightStyles();
      const block: Colored = {
        element,
        language,
        lines: new CodeLineTokens(
          code,
          listedLanguage(languages, language) ?? language,
        ),
        flat: rendered !== code,
        texts: [],
        starts: [],
        codeStarts: [],
        length: 0,
        leaves: new Map(),
        ranges: [],
      };
      $indexText(editor, node, block);
      repaintAll(block);
      colored.set(key, block);
      repainted.add(key);
    };
    // Recolors a block after an update that rewrote the text of its leaf
    // `leafKey` and changed nothing else in it. False when the block must
    // be colored in full instead.
    const $recolorLeaf = (key: NodeKey, leafKey: NodeKey): boolean => {
      const block = colored.get(key);
      const leaf = block?.leaves.get(leafKey);
      const node = $getNodeByKey(leafKey);
      const parent = node?.getParent();
      if (
        block == null ||
        leaf == null ||
        !$isTextNode(node) ||
        !$isCodeNode(parent) ||
        parent.getKey() !== key ||
        (parent.getLanguage() ?? '') !== block.language ||
        editor.getElementByKey(key) !== block.element
      ) {
        return false;
      }
      const text = block.texts[leaf.index];
      const dom = editor.getElementByKey(leafKey);
      const after = node.getTextContent();
      if (
        dom?.childNodes.length !== 1 ||
        dom.firstChild !== text ||
        text.data !== after
      ) {
        return false;
      }
      const before = leaf.text;
      if (after === before) {
        return true;
      }
      let first = 0;
      while (
        first < before.length &&
        first < after.length &&
        before[first] === after[first]
      ) {
        first++;
      }
      let beforeEnd = before.length;
      let afterEnd = after.length;
      while (
        beforeEnd > first &&
        afterEnd > first &&
        before[beforeEnd - 1] === after[afterEnd - 1]
      ) {
        beforeEnd--;
        afterEnd--;
      }
      const inserted = after.slice(first, afterEnd);
      // A flat block's text holds no line breaks; one typed in would no
      // longer lay the code over its rendered text.
      if (block.flat && inserted.includes('\n')) {
        return false;
      }
      const leafStart = block.codeStarts[leaf.index];
      const lines = block.lines.replace(
        leafStart + first,
        beforeEnd - first,
        inserted,
      );
      const delta = after.length - before.length;
      for (let i = leaf.index + 1; i < block.texts.length; i++) {
        block.starts[i] += delta;
        block.codeStarts[i] += delta;
      }
      block.length += delta;
      leaf.text = after;
      if (lines == null) {
        repaintAll(block);
        return true;
      }
      // Lexical rewrites a changed DOM text node whole, which leaves every
      // range in it stale: recolor each line the node holds, and any other
      // line the edit re-tokenized. Every other range sits in a text node of
      // its own line and is still right.
      const recolor = new Set(lines);
      const last = block.lines.lineAt(
        leafStart + Math.max(after.length - 1, 0),
      );
      for (let i = block.lines.lineAt(leafStart); i <= last; i++) {
        recolor.add(i);
      }
      for (const i of recolor) {
        unpaintLine(block, i);
        paintLine(block, i);
      }
      return true;
    };
    const unregisterMutations = editor.registerMutationListener(
      CodeNode,
      mutations => {
        editor.getEditorState().read(() => {
          for (const [key, mutation] of mutations) {
            if (mutation === 'destroyed') {
              blocks.delete(key);
              uncolor(key);
            } else {
              blocks.add(key);
              $color(key, false);
            }
          }
        });
      },
      {skipInitialization: false},
    );
    repainted.clear();
    // Typing in a block changes its text nodes, not the block itself: after
    // each update, recolor the blocks whose text nodes changed. A block whose
    // only change is one leaf's text takes the partial path; any other
    // change colors it in full, unless the block listener just did.
    const unregisterUpdates = editor.registerUpdateListener(
      ({editorState, mutatedNodes, prevEditorState}) => {
        if (mutatedNodes != null && blocks.size > 0) {
          const mutations: Array<[NodeKey, NodeMutation]> = [];
          for (const nodes of mutatedNodes.values()) {
            for (const mutation of nodes) {
              mutations.push(mutation);
            }
          }
          const before = prevEditorState.read(() =>
            mutations.map(([key, mutation]) =>
              mutation === 'created' ? null : $codeBlockOf(key),
            ),
          );
          editorState.read(() => {
            // Each changed block, with the one leaf whose text an update
            // rewrote, or null when anything else in it changed.
            const changed = new Map<NodeKey, NodeKey | null>();
            const note = (key: NodeKey | null, leafKey: NodeKey | null) => {
              if (key != null && blocks.has(key)) {
                changed.set(key, changed.has(key) ? null : leafKey);
              }
            };
            mutations.forEach(([key, mutation], i) => {
              const after = mutation === 'destroyed' ? null : $codeBlockOf(key);
              const rewritten =
                mutation === 'updated' &&
                after === before[i] &&
                $isTextNode($getNodeByKey(key));
              note(after, rewritten ? key : null);
              if (before[i] !== after) {
                note(before[i], null);
              }
            });
            for (const [key, leafKey] of changed) {
              if (
                !repainted.has(key) &&
                (leafKey == null || !$recolorLeaf(key, leafKey))
              ) {
                $color(key, true);
              }
            }
          });
        }
        repainted.clear();
      },
    );
    return () => {
      unregisterMutations();
      unregisterUpdates();
      for (const key of [...colored.keys()]) {
        uncolor(key);
      }
      blocks.clear();
    };
  }, [editor, languages]);

  return null;
}
