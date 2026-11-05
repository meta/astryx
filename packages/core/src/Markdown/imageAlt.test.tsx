// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {parseInlineAst, parseMarkdownAst} from './parser';

type Json = {type: string; alt?: string; children?: Json[]};

/** Every image's alt text, in order, searched iteratively. */
function alts(nodes: ReadonlyArray<Json>): string[] {
  const found: string[] = [];
  const stack = [...nodes].reverse();
  while (stack.length > 0) {
    const node = stack.pop() as Json;
    if (node.type === 'image') {
      found.push(node.alt ?? '');
    }
    stack.push(...[...(node.children ?? [])].reverse());
  }
  return found;
}

const inlineAlts = (markdown: string): string[] =>
  alts(parseInlineAst(markdown) as unknown as Json[]);

const documentAlts = (markdown: string): string[] =>
  alts(parseMarkdownAst(markdown).children as unknown as Json[]);

describe("an image's alt text is its description as plain text (CommonMark 0.31 §6.4)", () => {
  it.each([
    ['code', '![`a]b`](u)', ['a]b']],
    ['emphasis, strong, and code', '![*a* **b** `c`](u)', ['a b c']],
    ['a link', '![a [b](u) c](v)', ['a b c']],
    ['an image', '![a ![b](u) c](v)', ['a b c']],
    ['escapes and character references', '![&amp; \\* x](u)', ['& * x']],
    ['plain text, unchanged', '![a photo](u)', ['a photo']],
    [
      'a hard break as a line ending',
      '![first  \nsecond](u)',
      ['first\nsecond'],
    ],
    [
      'a backslash hard break as a line ending',
      '![first\\\nsecond](u)',
      ['first\nsecond'],
    ],
    ['a soft break as a line ending', '![first\nsecond](u)', ['first\nsecond']],
    [
      'a hard break inside emphasis',
      '![*first  \nsecond*](u)',
      ['first\nsecond'],
    ],
  ])('reads %s: %j', (_, markdown, expected) => {
    expect(inlineAlts(markdown)).toEqual(expected);
  });

  it('reads a reference image the same way', () => {
    expect(documentAlts('![*a*][r]\n\n[r]: /i.png')).toEqual(['a']);
  });

  it('reads an image on its own line the same way', () => {
    expect(documentAlts('![*a* `b`](/i.png)')).toEqual(['a b']);
  });

  it('reads a description ten images deep, and keeps the source deeper', () => {
    const nested = (levels: number) =>
      `${'!['.repeat(levels)}*a*${'](u)'.repeat(levels)}`;
    expect(inlineAlts(nested(10))[0]).toBe('a');
    expect(inlineAlts(nested(12))[0]).toContain('*a*');
  });

  it('reads images nested 20,000 deep without exhausting the stack, in time', () => {
    const markdown = `${'!['.repeat(20_000)}a${'](u)'.repeat(20_000)}`;
    expect(() => parseInlineAst(markdown)).not.toThrow();
    let fastest = Number.POSITIVE_INFINITY;
    for (let round = 0; round < 3; round++) {
      const started = performance.now();
      parseInlineAst(markdown);
      fastest = Math.min(fastest, performance.now() - started);
    }
    // Alone it takes about 40 ms; the budget leaves room for a loaded test
    // machine.
    expect(fastest).toBeLessThan(1000);
  });
});
