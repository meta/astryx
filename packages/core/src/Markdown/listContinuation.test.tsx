// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {
  createIncrementalState,
  parseMarkdown,
  parseMarkdownAst,
  parseMarkdownIncremental,
} from './parser';

type Json = {type: string; value?: string; lang?: string; children?: Json[]};

/** The document's blocks as compact markup. */
function blocks(markdown: string): string {
  const show = (node: Json): string =>
    node.type === 'text'
      ? JSON.stringify(node.value)
      : node.type === 'code'
        ? `code(${node.lang ?? ''})${JSON.stringify(node.value)}`
        : node.children == null
          ? node.type
          : `${node.type}[${node.children.map(show).join(', ')}]`;
  return (parseMarkdownAst(markdown).children as unknown as Json[])
    .map(show)
    .join(' | ');
}

const NESTED_AFTER_BLANK = '1. a\n\n   - sub\n2. b';
const STEPS_WITH_CODE =
  '1. Step one\n\n   ```bash\n   cmd\n\n   more\n   ```\n\n2. Step two';

describe('a list item continues past blank lines (CommonMark 0.31 §5.2)', () => {
  it.each([
    [
      'a nested list after a blank line, then the next item',
      NESTED_AFTER_BLANK,
      'list[listItem[paragraph["a"], list[listItem[paragraph["sub"]]]], listItem[paragraph["b"]]]',
    ],
    [
      'a nested ordered list after a blank line',
      '1. a\n\n    26. b',
      'list[listItem[paragraph["a"], list[listItem[paragraph["b"]]]]]',
    ],
    [
      'a second paragraph indented into the item',
      '- a\n\n  b',
      'list[listItem[paragraph["a"], paragraph["b"]]]',
    ],
    [
      'nested items and a sibling, each after a blank line',
      '- a\n\n  - b\n\n- c',
      'list[listItem[paragraph["a"], list[listItem[paragraph["b"]]]], listItem[paragraph["c"]]]',
    ],
    [
      'a fenced code block, blank lines inside it included',
      STEPS_WITH_CODE,
      'list[listItem[paragraph["Step one"], code(bash)"cmd\\n\\nmore"], listItem[paragraph["Step two"]]]',
    ],
  ])('%s', (_, markdown, expected) => {
    expect(blocks(markdown)).toBe(expected);
  });

  it.each([
    [
      'a paragraph at the margin',
      '- a\n\nb',
      'list[listItem[paragraph["a"]]] | paragraph["b"]',
    ],
    [
      'a line indented less than the content',
      '1. a\n\n  b',
      'list[listItem[paragraph["a"]]] | paragraph["  b"]',
    ],
  ])('ends the list at %s', (_, markdown, expected) => {
    expect(blocks(markdown)).toBe(expected);
  });

  it.each([
    NESTED_AFTER_BLANK,
    STEPS_WITH_CODE,
    '- a\n\n  b\n\n  - c\n\nd\n\n- e',
  ])('streams %j to the full parse at every character', markdown => {
    for (const sourceRanges of [false, true]) {
      const state = createIncrementalState();
      let streamed = parseMarkdownIncremental('', state, {sourceRanges});
      for (let end = 1; end <= markdown.length; end++) {
        streamed = parseMarkdownIncremental(markdown.slice(0, end), state, {
          sourceRanges,
        });
      }
      expect(streamed).toEqual(parseMarkdown(markdown, {sourceRanges}));
    }
  });
});
