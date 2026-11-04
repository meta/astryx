// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {parseMarkdownAst} from './parser';

type Json = {type: string; value?: string; children?: Json[]};

/** The document's blocks as compact markup. */
function blocks(markdown: string): string {
  const show = (node: Json): string =>
    node.type === 'text'
      ? JSON.stringify(node.value)
      : node.children == null
        ? node.type
        : `${node.type}[${node.children.map(show).join(', ')}]`;
  return (parseMarkdownAst(markdown).children as unknown as Json[])
    .map(show)
    .join(' | ');
}

const item = (text: string) => `listItem[paragraph["${text}"]]`;

describe('a list keeps the bullet it starts with (CommonMark 0.31 §5.3)', () => {
  it.each([
    ['`-` then `*`', '- a\n* b', [`list[${item('a')}]`, `list[${item('b')}]`]],
    [
      '`-`, `+`, then `-`',
      '- a\n+ b\n- c',
      [`list[${item('a')}]`, `list[${item('b')}]`, `list[${item('c')}]`],
    ],
    [
      '`-` then `*` after a blank line',
      '- a\n\n* b',
      [`list[${item('a')}]`, `list[${item('b')}]`],
    ],
  ])('another bullet starts a new list: %s', (_, markdown, expected) => {
    expect(blocks(markdown)).toBe(expected.join(' | '));
  });

  it.each([
    ['the same bullet', '* a\n* b', `list[${item('a')}, ${item('b')}]`],
    [
      'a nested list with another bullet',
      '- a\n  * b',
      `list[listItem[paragraph["a"], list[${item('b')}]]]`,
    ],
    [
      'ordered items with one delimiter',
      '1. a\n2. b',
      `list[${item('a')}, ${item('b')}]`,
    ],
  ])('keeps one list for %s', (_, markdown, expected) => {
    expect(blocks(markdown)).toBe(expected);
  });
});
