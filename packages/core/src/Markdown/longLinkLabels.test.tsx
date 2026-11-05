// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {
  createIncrementalState,
  parseMarkdown,
  parseMarkdownAst,
  parseMarkdownIncremental,
} from './parser';

type Json = {type: string; value?: string; url?: string; children?: Json[]};

const textOf = (node: Json): string =>
  node.value ?? (node.children ?? []).map(textOf).join('');

const blocks = (markdown: string) =>
  parseMarkdownAst(markdown).children as unknown as Json[];

describe('a link label over 999 characters defines nothing (CommonMark 0.31 §4.7)', () => {
  const longLabel = 'a'.repeat(1000);
  const longDefinition = `[${longLabel}]: /u`;

  it('keeps a definition line with a 1,000-character label as text', () => {
    const markdown = `before\n\n${longDefinition}\n\nafter`;
    expect(blocks(markdown).map(node => [node.type, textOf(node)])).toEqual([
      ['paragraph', 'before'],
      ['paragraph', longDefinition],
      ['paragraph', 'after'],
    ]);
  });

  it('still reads a definition with a 999-character label', () => {
    const label = 'a'.repeat(999);
    const [paragraph] = blocks(`[${label}]: /u\n\n[${label}]`);
    expect(paragraph.type).toBe('paragraph');
    expect(paragraph.children?.[0]).toMatchObject({type: 'link', url: '/u'});
  });

  it('streams the long line to the full parse', () => {
    const markdown = `before\n\n${longDefinition}\n\nafter`;
    const state = createIncrementalState();
    let streamed = parseMarkdownIncremental('', state);
    for (let end = 0; end < markdown.length;) {
      end = Math.min(markdown.length, end + 37);
      streamed = parseMarkdownIncremental(markdown.slice(0, end), state);
    }
    expect(streamed).toEqual(parseMarkdown(markdown));
  });
});
