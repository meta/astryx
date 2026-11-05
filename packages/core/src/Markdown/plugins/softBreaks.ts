// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file softBreaks.ts
 * @input Soft line endings in Markdown phrasing content
 * @output A first-party plugin that renders each soft line ending as a hard break
 * @position Optional Markdown transform built only on the public plugin protocol
 */

import type {
  MarkdownAstBlockContent,
  MarkdownAstExtensionNode,
  MarkdownAstListItem,
  MarkdownAstPhrasingContent,
  MarkdownAstTableCell,
  MarkdownAstTableRow,
} from '../ast';
import {createMarkdownPlugin, type MarkdownTransform} from './protocol';

type Extension = MarkdownAstExtensionNode;
type Phrasing = MarkdownAstPhrasingContent<Extension>;
type Block = MarkdownAstBlockContent<Extension>;

function replaceLineEndings(value: string): ReadonlyArray<Phrasing> | null {
  const pattern = /\r?\n|\r/g;
  let match = pattern.exec(value);
  if (match == null) {
    return null;
  }
  const output: Phrasing[] = [];
  let cursor = 0;
  do {
    if (match.index > cursor) {
      output.push({type: 'text', value: value.slice(cursor, match.index)});
    }
    output.push({type: 'break'});
    cursor = match.index + match[0].length;
    match = pattern.exec(value);
  } while (match != null);
  if (cursor < value.length) {
    output.push({type: 'text', value: value.slice(cursor)});
  }
  return output;
}

function transformPhrasing(
  children: ReadonlyArray<Phrasing>,
): ReadonlyArray<Phrasing> {
  let next: Phrasing[] | undefined;
  for (let index = 0; index < children.length; index++) {
    const node = children[index];
    if (node.type === 'text') {
      const replacement = replaceLineEndings(node.value);
      if (replacement == null) {
        next?.push(node);
      } else {
        next ??= children.slice(0, index);
        next.push(...replacement);
      }
      continue;
    }
    if (
      node.type === 'strong' ||
      node.type === 'emphasis' ||
      node.type === 'delete' ||
      node.type === 'link'
    ) {
      const nested = transformPhrasing(node.children);
      if (nested !== node.children) {
        next ??= children.slice(0, index);
        next.push({...node, children: nested});
      } else {
        next?.push(node);
      }
      continue;
    }
    next?.push(node);
  }
  return next ?? children;
}

function transformTableCell(cell: MarkdownAstTableCell<Extension>) {
  const children = transformPhrasing(cell.children);
  return children === cell.children ? cell : {...cell, children};
}

function transformTableRow(row: MarkdownAstTableRow<Extension>) {
  const children = row.children.map(transformTableCell);
  return children.every((child, index) => child === row.children[index])
    ? row
    : {...row, children};
}

function transformListItem(item: MarkdownAstListItem<Extension>) {
  const children = transformBlocks(item.children);
  return children === item.children ? item : {...item, children};
}

function transformBlocks(children: ReadonlyArray<Block>): ReadonlyArray<Block> {
  let next: Block[] | undefined;
  for (let index = 0; index < children.length; index++) {
    const node = children[index];
    let transformed: Block = node;
    switch (node.type) {
      case 'heading':
      case 'paragraph': {
        const nested = transformPhrasing(node.children);
        if (nested !== node.children) {
          transformed = {...node, children: nested};
        }
        break;
      }
      case 'blockquote': {
        const nested = transformBlocks(node.children);
        if (nested !== node.children) {
          transformed = {...node, children: nested};
        }
        break;
      }
      case 'list': {
        const nested = node.children.map(transformListItem);
        if (
          nested.some(
            (child, childIndex) => child !== node.children[childIndex],
          )
        ) {
          transformed = {...node, children: nested};
        }
        break;
      }
      case 'table': {
        const nested = node.children.map(transformTableRow);
        if (
          nested.some(
            (child, childIndex) => child !== node.children[childIndex],
          )
        ) {
          transformed = {...node, children: nested};
        }
        break;
      }
      case 'code':
      case 'math':
      case 'thematicBreak':
      case 'image':
      case 'extension':
        break;
      default:
        node satisfies never;
    }
    if (transformed !== node) {
      next ??= children.slice(0, index);
    }
    next?.push(transformed);
  }
  return next ?? children;
}

const transformSoftBreaks: MarkdownTransform<never> = document => {
  const children = transformBlocks(document.children);
  return children === document.children ? document : {...document, children};
};

/** Converts soft line endings in Markdown phrasing content to hard breaks. */
export const markdownSoftBreaksPlugin = createMarkdownPlugin({
  name: 'soft-breaks',
  apiVersion: 1,
  transform: transformSoftBreaks,
});
