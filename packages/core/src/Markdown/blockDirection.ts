// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file blockDirection.ts
 * @input A Markdown AST prose block (a paragraph, heading, blockquote or list
 *   item) or a table cell
 * @output The `dir` for the block: its own text's direction, or the
 *   provider's for a block whose text has no strongly directional character
 * @position Read by Markdown.tsx to set each block's `dir`.
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

/** The provider's direction, and the direction of the block around this one. */
export interface BlockDirectionScope {
  readonly provider: 'ltr' | 'rtl';
  readonly around: 'ltr' | 'rtl';
}

/**
 * The `dir` for a prose block or a table cell. A block with no direction of
 * its own takes the provider's. It needs the attribute only where the block
 * around it reads the other way; elsewhere it inherits the same direction.
 */
export function blockDirection(
  node: DirectionalNode,
  scope: BlockDirectionScope | undefined,
): 'ltr' | 'rtl' | undefined {
  const own = markdownBlockDirection(node);
  if (own != null) {
    return own;
  }
  return scope != null && scope.around !== scope.provider
    ? scope.provider
    : undefined;
}

/** The scope for the blocks inside a quote or a list item. */
export function innerDirectionScope(
  node: DirectionalNode,
  scope: BlockDirectionScope | undefined,
): BlockDirectionScope | undefined {
  if (scope == null) {
    return undefined;
  }
  return {
    provider: scope.provider,
    around: markdownBlockDirection(node) ?? scope.provider,
  };
}
