// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file markdownSpaceRuns.ts
 * @input Lexical nodes to export as Markdown, and the transformers to use
 * @output $convertToMarkdownKeepingTimeLinear: Lexical's Markdown export, in
 *   time linear in the text even when a text holds long runs of spaces
 * @position Every Markdown export in this package goes through it
 *   (markdownSource.ts, markdownTable.ts). Lexical's text-format export splits
 *   each text into leading spaces, content, and trailing spaces with
 *   `/^(\s*)(.*?)(\s*)$/s`, which retries from every character of a long run
 *   of spaces inside the text, so its time grows with the square of the run.
 *   Each such run is exported as private-use stand-ins, which that pattern
 *   passes in one step each, and put back afterwards. Leading and trailing
 *   spaces, which decide where marks attach, are left as they are.
 */

import type {ElementNode, LexicalNode} from 'lexical';
import type {Transformer} from '@lexical/markdown';
import {$isCodeNode} from '@lexical/code';
import {$convertToMarkdownString} from '@lexical/markdown';
import {$isElementNode, $isTextNode} from 'lexical';
import {absentCharacters} from './markdownCharacterReferences';

/**
 * A run of spaces with other characters on both sides, long enough for
 * Lexical's pattern to cost noticeably more than one step per space; shorter
 * runs, as ordinary text has, export as they are.
 */
const INNER_SPACE_RUN = /(?<=\S)\s{64,}(?=\S)/g;

/** Whether Lexical exports the text node's text as written, untouched. */
function isLiteralText(node: LexicalNode): boolean {
  return (
    $isTextNode(node) &&
    (node.hasFormat('code') || $isCodeNode(node.getParent()))
  );
}

/**
 * Lexical's `$convertToMarkdownString(transformers, root)`, with every long
 * run of spaces inside a text exported as stand-ins and put back, so the
 * export takes time linear in the text. The tree is read through views, never
 * changed; a tree with no long run exports directly.
 */
export function $convertToMarkdownKeepingTimeLinear(
  transformers: Array<Transformer>,
  root: ElementNode,
): string {
  const spaces = new Set<string>();
  const findRuns = (node: LexicalNode) => {
    if ($isTextNode(node)) {
      if (!isLiteralText(node)) {
        for (const run of node.getTextContent().match(INNER_SPACE_RUN) ?? []) {
          for (const space of run) {
            spaces.add(space);
          }
        }
      }
    } else if ($isElementNode(node) && !$isCodeNode(node)) {
      node.getChildren().forEach(findRuns);
    }
  };
  root.getChildren().forEach(findRuns);
  if (spaces.size === 0) {
    return $convertToMarkdownString(transformers, root);
  }
  // Every string the export can write — texts, and the properties nodes
  // serialize, such as a link's address and title — so a stand-in occurs
  // nowhere else in the output.
  const written: string[] = [];
  const collect = (node: LexicalNode) => {
    written.push(JSON.stringify(node.exportJSON()));
    if ($isTextNode(node)) {
      written.push(node.getTextContent());
    } else if ($isElementNode(node)) {
      node.getChildren().forEach(collect);
    }
  };
  root.getChildren().forEach(collect);
  const free = absentCharacters(written.join(''));
  const standIns = new Map<string, string>();
  for (const space of spaces) {
    const standIn = free.next().value;
    if (standIn == null) {
      return $convertToMarkdownString(transformers, root);
    }
    standIns.set(space, standIn);
  }
  const placed = {count: 0};
  const children = viewsOf(root.getChildren(), standIns, placed);
  const view = Object.create(root) as typeof root;
  view.getChildren = <T extends LexicalNode>() => children as Array<T>;
  let markdown = $convertToMarkdownString(transformers, view);
  // Every stand-in in the output must be one this export placed; otherwise
  // the plain export, slower but exact, is the answer.
  let found = 0;
  for (const standIn of standIns.values()) {
    found += markdown.split(standIn).length - 1;
  }
  if (found !== placed.count) {
    return $convertToMarkdownString(transformers, root);
  }
  for (const [space, standIn] of standIns) {
    markdown = markdown.split(standIn).join(space);
  }
  return markdown;
}

/**
 * Views of `nodes` whose texts hold stand-ins for their inner runs of
 * spaces; a node with no such run is itself. Each view's siblings are the
 * views beside it, as Lexical's exporter reads neighbors to place marks.
 */
function viewsOf(
  nodes: ReadonlyArray<LexicalNode>,
  standIns: ReadonlyMap<string, string>,
  placed: {count: number},
): LexicalNode[] {
  const views = nodes.map(node => viewOf(node, standIns, placed));
  views.forEach((view, index) => {
    if (view !== nodes[index]) {
      view.getPreviousSibling = <T extends LexicalNode>() =>
        (views[index - 1] ?? null) as T | null;
      view.getNextSibling = <T extends LexicalNode>() =>
        (views[index + 1] ?? null) as T | null;
    }
  });
  return views;
}

function viewOf(
  node: LexicalNode,
  standIns: ReadonlyMap<string, string>,
  placed: {count: number},
): LexicalNode {
  if ($isTextNode(node)) {
    if (isLiteralText(node)) {
      return node;
    }
    const text = node.getTextContent();
    const stood = text.replace(INNER_SPACE_RUN, run => {
      placed.count += run.length;
      return Array.from(run, space => standIns.get(space) ?? space).join('');
    });
    if (stood === text) {
      return node;
    }
    const view = Object.create(node) as typeof node;
    view.getTextContent = () => stood;
    return view;
  }
  if ($isElementNode(node) && !$isCodeNode(node)) {
    const original = node.getChildren();
    const children = viewsOf(original, standIns, placed);
    if (children.every((child, index) => child === original[index])) {
      return node;
    }
    const view = Object.create(node) as typeof node;
    view.getChildren = <T extends LexicalNode>() => children as Array<T>;
    return view;
  }
  return node;
}
