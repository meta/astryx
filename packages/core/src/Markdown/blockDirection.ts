// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file blockDirection.ts
 * @input A Markdown AST prose block: a paragraph, heading, blockquote or list
 *   item
 * @output The block's own direction, 'ltr' or 'rtl', or undefined when its
 *   text has no strongly directional character
 * @position Read by Markdown.tsx to give each prose block the `dir` of its
 *   own text (spec:AST-061 FR6). A block with no direction of its own takes
 *   its parent's.
 */

import {firstStrongDirection} from '../i18n/firstStrongDirection';

interface DirectionalNode {
  readonly type: string;
  readonly value?: unknown;
  readonly children?: ReadonlyArray<DirectionalNode>;
}

/**
 * Nodes whose text does not count. An image, a code block, math and a table
 * read on their own terms. An extension node or a citation shows text that is
 * not in the tree.
 */
const SKIPPED_TYPES = new Set([
  'image',
  'code',
  'math',
  'inlineMath',
  'table',
  'thematicBreak',
  'html',
  'citation',
  'break',
  'extension',
]);

function nodeDirection(node: DirectionalNode): 'ltr' | 'rtl' | null {
  if (SKIPPED_TYPES.has(node.type)) {
    return null;
  }
  if (typeof node.value === 'string') {
    return firstStrongDirection(node.value);
  }
  for (const child of node.children ?? []) {
    const direction = nodeDirection(child);
    if (direction != null) {
      return direction;
    }
  }
  return null;
}

/**
 * The direction of a prose block's own text. A list item and a blockquote read
 * everything under them, nested lists included, so a nested step resolves
 * against the item that holds it.
 */
export function markdownBlockDirection(
  node: DirectionalNode,
): 'ltr' | 'rtl' | undefined {
  return nodeDirection(node) ?? undefined;
}
