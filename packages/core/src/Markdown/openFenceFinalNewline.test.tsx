// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {
  createIncrementalState,
  parseMarkdown,
  parseMarkdownAst,
  parseMarkdownIncremental,
} from './parser';

type Json = {
  type: string;
  value?: string;
  position?: {end: {offset: number}};
  children?: Json[];
};

const codeBlocks = (markdown: string, sourceRanges = false) =>
  (
    parseMarkdownAst(markdown, {sourceRanges}).children as unknown as Json[]
  ).filter(node => node.type === 'code');

const CASES: ReadonlyArray<[string, string, string]> = [
  ['one line, then the final newline', '```js\ncode\n', 'code'],
  ['a blank line before the final newline', '```js\ncode\n\n', 'code\n'],
  ['only the opening line and its newline', '```js\n', ''],
  ['blank lines inside', 'a\n\n```\nx\n\ny\n', 'x\n\ny'],
  ['no final newline, unchanged', '```js\ncode', 'code'],
  ['a closed fence, unchanged', '```js\ncode\n```\n', 'code'],
];

describe('a fence left open at the end keeps its code, not the final line ending', () => {
  it.each(CASES)('reads %s', (_, markdown, value) => {
    expect(codeBlocks(markdown).map(node => node.value)).toEqual([value]);
  });

  it.each(CASES)(
    'streams %s to the full parse at every character',
    (_, markdown) => {
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
    },
  );

  it.each(CASES)(
    'gives %s a source range that re-parses to the same code',
    (_, markdown) => {
      const [block] = parseMarkdown(markdown, {sourceRanges: true});
      const {range, ...node} = block;
      expect(range).toBeDefined();
      const sliced = markdown.slice(range!.start, range!.end);
      expect(parseMarkdown(sliced)).toEqual([node]);
    },
  );
});

describe('a fence left open inside a quote keeps its quoted blank lines', () => {
  const quoted = (markdown: string) =>
    (parseMarkdownAst(markdown).children as unknown as Json[])
      .filter(node => node.type === 'blockquote')
      .flatMap(node => node.children ?? [])
      .filter(node => node.type === 'code')
      .map(node => node.value);

  it.each([
    ['a quoted blank line', '> ```\n> code\n>\n', 'code\n'],
    ['the document’s final newline only', '> ```\n> code\n', 'code'],
  ])('reads %s as CommonMark does', (_, markdown, value) => {
    expect(quoted(markdown)).toEqual([value]);
    const state = createIncrementalState();
    let streamed = parseMarkdownIncremental('', state);
    for (let end = 1; end <= markdown.length; end++) {
      streamed = parseMarkdownIncremental(markdown.slice(0, end), state);
    }
    expect(streamed).toEqual(parseMarkdown(markdown));
  });
});
