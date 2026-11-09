// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {
  createIncrementalState,
  parseMarkdown,
  parseMarkdownAst,
  parseMarkdownIncremental,
} from './parser';

type Json = {type: string; value?: string; depth?: number; children?: Json[]};

/** The document's blocks as compact markup. */
function blocks(markdown: string): string {
  const show = (node: Json): string =>
    node.type === 'text'
      ? JSON.stringify(node.value)
      : node.children == null
        ? node.type
        : `${node.type}${node.depth ?? ''}[${node.children.map(show).join(', ')}]`;
  return (parseMarkdownAst(markdown).children as unknown as Json[])
    .map(show)
    .join(' | ');
}

describe('an ATX heading may be indented up to three spaces (CommonMark 0.31 §4.2)', () => {
  it.each([
    ['three spaces', '   # h', 'heading1["h"]'],
    ['one space, second level', ' ## h', 'heading2["h"]'],
    [
      'two spaces, interrupting a paragraph',
      'text\n  # h',
      'paragraph["text"] | heading1["h"]',
    ],
    ['no indentation, unchanged', '# h', 'heading1["h"]'],
  ])('reads %s as a heading', (_, markdown, expected) => {
    expect(blocks(markdown)).toBe(expected);
  });

  it('reads four spaces of indentation as no heading', () => {
    expect(blocks('    # h')).not.toContain('heading');
  });

  it('streams indented headings to the full parse at every character', () => {
    const markdown = 'a\n\n   # one\n\ntext\n  ## two\n';
    const state = createIncrementalState();
    let streamed = parseMarkdownIncremental('', state);
    for (let end = 1; end <= markdown.length; end++) {
      streamed = parseMarkdownIncremental(markdown.slice(0, end), state);
    }
    expect(streamed).toEqual(parseMarkdown(markdown));
  });
});
