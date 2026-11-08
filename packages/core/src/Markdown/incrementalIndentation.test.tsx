// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {
  createIncrementalState,
  parseMarkdown,
  parseMarkdownIncremental,
} from './parser';

describe("a streamed document keeps its first line's indentation", () => {
  it.each([
    ['sibling items indented two spaces', '  - a\n  - b'],
    ['ordered items indented one space', ' 1. a\n 2. b'],
    ['a paragraph indented one space', ' 1'],
    ['two paragraphs, each indented', ' a\n\n b'],
    ['a table indented two spaces', '  | a | b |\n  | - | - |\n  | 1 | 2 |'],
    ['a heading marker indented three spaces', '   # h'],
  ])('gives %s the full parse, at once and streamed', (_, markdown) => {
    const full = parseMarkdown(markdown);
    expect(
      parseMarkdownIncremental(markdown, createIncrementalState()),
    ).toEqual(full);
    const state = createIncrementalState();
    let streamed = parseMarkdownIncremental('', state);
    for (let end = 1; end <= markdown.length; end++) {
      streamed = parseMarkdownIncremental(markdown.slice(0, end), state);
    }
    expect(streamed).toEqual(full);
  });

  it('still drops blank lines before the first block', () => {
    expect(
      parseMarkdownIncremental('\n\n  - a\n  - b', createIncrementalState()),
    ).toEqual(parseMarkdown('\n\n  - a\n  - b'));
  });
});
