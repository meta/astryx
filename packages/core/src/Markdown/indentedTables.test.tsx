// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {
  createIncrementalState,
  parseMarkdown,
  parseMarkdownAst,
  parseMarkdownIncremental,
} from './parser';

type Json = {type: string; value?: string; children?: Json[]};

/** Each table row's cell texts. */
function tableRows(markdown: string): string[][] {
  const text = (node: Json): string =>
    node.value ?? (node.children ?? []).map(text).join('');
  const table = (parseMarkdownAst(markdown).children as unknown as Json[]).find(
    node => node.type === 'table',
  );
  return (table?.children ?? []).map(row => (row.children ?? []).map(text));
}

describe("a table row's indentation opens no cell", () => {
  it.each([
    ['indented two spaces', '  | a | b |\n  | - | - |\n  | 1 | 2 |'],
    ['indented three spaces', '   | a | b |\n   | - | - |\n   | 1 | 2 |'],
    ['indented with a tab', '\t| a | b |\n\t| - | - |\n\t| 1 | 2 |'],
    ['indented without outer pipes', '  a | b\n  - | -\n  1 | 2'],
    ['at the margin, unchanged', '| a | b |\n| - | - |\n| 1 | 2 |'],
  ])('reads a table %s as two columns', (_, markdown) => {
    expect(tableRows(markdown)).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('keeps an empty first cell written inside the pipes', () => {
    expect(tableRows('  |   | b |\n  | - | - |\n  |   | 2 |')).toEqual([
      ['', 'b'],
      ['', '2'],
    ]);
  });

  it('streams an indented table to the full parse at every character', () => {
    const markdown = 'Intro\n\n  | a | b |\n  | - | - |\n  | 1 | 2 |\n\nAfter';
    const state = createIncrementalState();
    let streamed = parseMarkdownIncremental('', state);
    for (let end = 1; end <= markdown.length; end++) {
      streamed = parseMarkdownIncremental(markdown.slice(0, end), state);
    }
    expect(streamed).toEqual(parseMarkdown(markdown));
  });
});
