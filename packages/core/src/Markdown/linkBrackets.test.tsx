// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {parseInlineAst, parseMarkdownAst} from './parser';

type Json = {
  type: string;
  url?: string;
  alt?: string;
  value?: string;
  children?: Json[];
};

/** Inline nodes as compact markup: links as `<a url>…</a>`. */
function show(nodes: ReadonlyArray<Json>): string {
  return nodes
    .map(node => {
      switch (node.type) {
        case 'text':
          return node.value;
        case 'inlineCode':
          return `\`${node.value}\``;
        case 'link':
          return `<a ${node.url}>${show(node.children ?? [])}</a>`;
        case 'image':
          return `<img ${node.url}>`;
        default:
          return `<${node.type}>${show(node.children ?? [])}</${node.type}>`;
      }
    })
    .join('');
}

const inline = (markdown: string): string =>
  show(parseInlineAst(markdown) as unknown as Json[]);

/** The first paragraph of a document, as compact markup. */
const paragraph = (markdown: string): string =>
  show(
    (parseMarkdownAst(markdown).children as unknown as Json[])[0].children ??
      [],
  );

describe('link text brackets (CommonMark 0.31 §6.3)', () => {
  it.each([
    [
      'link text may hold balanced brackets',
      '[a [b] c](u)',
      '<a u>a [b] c</a>',
    ],
    ['a bracket pair can be the whole text', '[[b]](u)', '<a u>[b]</a>'],
    ['the innermost opener makes the link', '[a [b](u)', '[a <a u>b</a>'],
    [
      'a link inside link text wins; the outer brackets stay text',
      '[a [b](u) c](v)',
      '[a <a u>b</a> c](v)',
    ],
    ['an image may sit in link text', '[![i](img)](u)', '<a u><img img></a>'],
    ['an image may hold a link', '![a [b](u) c](v) d', '<img v> d'],
    [
      'a refused inner link still keeps the outer brackets text',
      '[a [b](javascript:x) c](v)',
      '[a [b](javascript:x) c](v)',
    ],
    [
      'emphasis may cross brackets that stay text',
      '*[a [b](u) c*](v)',
      '<emphasis>[a <a u>b</a> c</emphasis>](v)',
    ],
    ['an unmatched closer is text', '[a]b](u)', '[a]b](u)'],
    [
      'brackets in a destination pair with nothing',
      '[a](b]c) [d](e)',
      '<a b]c>a</a> <a e>d</a>',
    ],
    ['an escaped bracket is text', '[a\\]b](u)', '<a u>a]b</a>'],
    ['a code span hides its brackets', '[`]`](u)', '<a u>`]`</a>'],
  ])('%s: %j', (_, markdown, expected) => {
    expect(inline(markdown)).toBe(expected);
  });

  it('pairs reference links the same way', () => {
    const definitions = '\n\n[bar]: /bar\n[y]: /y';
    expect(paragraph(`[foo [bar]]${definitions}`)).toBe(
      '[foo <a /bar>bar</a>]',
    );
    expect(paragraph(`[x][y]${definitions}`)).toBe('<a /y>x</a>');
    expect(paragraph(`[a [bar] c](u)${definitions}`)).toBe(
      '[a <a /bar>bar</a> c](u)',
    );
  });

  it.each([
    [
      'many openers around one link',
      `${'['.repeat(20_000)}[a](u)${'](v)'.repeat(20_000)}`,
    ],
    ['many links inside link text', '[a [b](u) '.repeat(10_000)],
    [
      'deeply balanced brackets',
      `${'['.repeat(20_000)}a${']'.repeat(20_000)}(u)`,
    ],
    ['nested images', `${'!['.repeat(20_000)}a${'](u)'.repeat(20_000)}`],
  ])('pairs %s in linear time', (_, markdown) => {
    parseInlineAst(markdown);
    let fastest = Number.POSITIVE_INFINITY;
    for (let round = 0; round < 3; round++) {
      const started = performance.now();
      parseInlineAst(markdown);
      fastest = Math.min(fastest, performance.now() - started);
    }
    // Alone, each takes 10–140 ms; the budget leaves room for a loaded
    // test machine.
    expect(fastest).toBeLessThan(2000);
  });
});
