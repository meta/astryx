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

describe('a thematic break after a list item (CommonMark 0.31 §4.1)', () => {
  it.each([
    ['`* * *` after a `-` item', '- item\n* * *'],
    ['`- - -` after a `-` item', '- item\n- - -'],
    ['`* * *` after a `*` item', '* item\n* * *'],
    ['a break after a blank line', '- item\n\n* * *'],
    ['a break after an ordered item', '1. item\n* * *'],
  ])('ends the list: %s', (_, markdown) => {
    expect(blocks(markdown)).toMatch(
      /^list\[listItem\[paragraph\["item"\]\]\] \| thematicBreak$/,
    );
  });

  it.each([
    [
      'a break indented into the item',
      '- a\n  * * *\n  b',
      'list[listItem[paragraph["a"], thematicBreak, paragraph["b"]]]',
    ],
    ['an item holding a break', '- * * *', 'list[listItem[thematicBreak]]'],
    [
      'two items',
      '- a\n- b',
      'list[listItem[paragraph["a"]], listItem[paragraph["b"]]]',
    ],
  ])('leaves %s as it was', (_, markdown, expected) => {
    expect(blocks(markdown)).toBe(expected);
  });
});
