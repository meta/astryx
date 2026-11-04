// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {parseInlineAst, parseMarkdownAst} from './parser';

type Json = {
  type: string;
  value?: string;
  url?: string;
  children?: Json[];
};

/** Each inline node in order: `link(url: …)`, `code(…)`, or its text. */
function shape(nodes: ReadonlyArray<Json>): string[] {
  const out: string[] = [];
  for (const node of nodes) {
    if (node.type === 'link' || node.type === 'image') {
      out.push(
        `${node.type}(${node.url}: ${shape(node.children ?? []).join(' + ')})`,
      );
    } else if (node.type === 'inlineCode') {
      out.push(`code(${node.value})`);
    } else if (node.type === 'text') {
      out.push(node.value ?? '');
    } else {
      out.push(...shape(node.children ?? []));
    }
  }
  return out;
}

const inline = (markdown: string): string[] =>
  shape(parseInlineAst(markdown) as unknown as Json[]);

describe('a code span in link text hides its brackets (CommonMark 0.31 §6.1)', () => {
  it.each([
    ['[`[x](javascript:y)`](/rel)', ['link(/rel: code([x](javascript:y)))']],
    ['[`a]b`](/u)', ['link(/u: code(a]b))']],
    ['[a `b](c)` d](/e)', ['link(/e: a  + code(b](c)) +  d)']],
    ['[a `b](c)` d', ['[a ', 'code(b](c))', ' d']],
    ['[a `b](/u)', ['link(/u: a `b)']],
    ['![`a]b`](/i.png)', ['image(/i.png: )']],
  ])('reads %j', (markdown, expected) => {
    expect(inline(markdown)).toEqual(expected);
  });

  it('closes a reference link’s text and label past code too', () => {
    const [paragraph] = parseMarkdownAst('[`a]b`][r]\n\n[r]: /u\n')
      .children as unknown as Json[];
    expect(shape(paragraph.children ?? [])).toEqual(['link(/u: code(a]b))']);
  });

  it('finds the text of many links in linear time, past code spans', () => {
    const markdown = `${'[a `b '.repeat(20_000)}]`;
    parseInlineAst(markdown);
    let fastest = Number.POSITIVE_INFINITY;
    for (let round = 0; round < 3; round++) {
      const started = performance.now();
      parseInlineAst(markdown);
      fastest = Math.min(fastest, performance.now() - started);
    }
    // The budget leaves room for a loaded test machine.
    expect(fastest).toBeLessThan(1000);
  });
});
