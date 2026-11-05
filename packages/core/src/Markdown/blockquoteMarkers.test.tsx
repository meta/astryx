// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {
  createIncrementalState,
  parseMarkdown,
  parseMarkdownAst,
  parseMarkdownIncremental,
} from './parser';

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

describe('a block quote marker is up to three spaces, then `>` (CommonMark 0.31 §5.1)', () => {
  it.each([
    ['text right after the marker', '>a', 'blockquote[paragraph["a"]]'],
    ['a tab after the marker', '>\ta', 'blockquote[paragraph["a"]]'],
    ['three spaces of indentation', '   > a', 'blockquote[paragraph["a"]]'],
    [
      'markers without spaces, nested',
      '>> a',
      'blockquote[blockquote[paragraph["a"]]]',
    ],
    [
      'three markers, nested three deep',
      '>>> a',
      'blockquote[blockquote[blockquote[paragraph["a"]]]]',
    ],
    [
      'consecutive lines without spaces',
      '>a\n>b',
      'blockquote[paragraph["a\\nb"]]',
    ],
    [
      'a quote interrupting a paragraph',
      'text\n>quote',
      'paragraph["text"] | blockquote[paragraph["quote"]]',
    ],
    ['the usual form, unchanged', '> a', 'blockquote[paragraph["a"]]'],
  ])('reads %s', (_, markdown, expected) => {
    expect(blocks(markdown)).toBe(expected);
  });

  it('reads four spaces of indentation as no marker', () => {
    expect(blocks('    > a')).toBe('paragraph["    > a"]');
  });

  it('streams quotes without spaces to the full parse at every character', () => {
    const markdown = '>a\n>b\n\n>> c\n\ntext\n   > d';
    const state = createIncrementalState();
    let streamed = parseMarkdownIncremental('', state);
    for (let end = 1; end <= markdown.length; end++) {
      streamed = parseMarkdownIncremental(markdown.slice(0, end), state);
    }
    expect(streamed).toEqual(parseMarkdown(markdown));
  });
});
