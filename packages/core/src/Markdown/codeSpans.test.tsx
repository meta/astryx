// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {parseInlineAst, parseMarkdownAst} from './parser';

type Json = {type: string; value?: string; children?: Json[]};

/** Each inline node as `code(…)` or its text, in order. */
function spans(markdown: string): string[] {
  const out: string[] = [];
  const visit = (node: Json) => {
    if (node.type === 'inlineCode') {
      out.push(`code(${node.value})`);
    } else if (node.type === 'text') {
      out.push(node.value ?? '');
    } else {
      (node.children ?? []).forEach(visit);
    }
  };
  (parseInlineAst(markdown) as unknown as Json[]).forEach(visit);
  return out;
}

describe('code spans close at a backtick string of the same length (CommonMark 0.31 §6.1)', () => {
  it.each([
    ['`foo`', ['code(foo)']],
    ['``foo`bar``', ['code(foo`bar)']],
    ['`one`` &amp; two`', ['code(one`` &amp; two)']],
    ['`foo``bar``', ['`foo', 'code(bar)']],
    ['````x````', ['code(x)']],
    ['````x``` y````', ['code(x``` y)']],
    ['```foo``', ['```foo``']],
    ['`foo', ['`foo']],
    ['a `` b ` c `` d', ['a ', 'code( b ` c )', ' d']],
    [
      '`a` and ``b`` and `c`',
      ['code(a)', ' and ', 'code(b)', ' and ', 'code(c)'],
    ],
  ])('reads %j', (markdown, expected) => {
    expect(spans(markdown)).toEqual(expected);
  });

  it('closes a span in a table cell at the same length, with an escaped pipe as a pipe', () => {
    const table = parseMarkdownAst('| a |\n| --- |\n| ``x`y \\| z`` |\n')
      .children[0] as unknown as Json;
    const cell = table.children?.[1]?.children?.[0];
    expect(cell?.children).toEqual([{type: 'inlineCode', value: 'x`y | z'}]);
  });

  it('finds every closer in linear time, even with no closer for most strings', () => {
    // Backtick strings of every length up to 400, none with a closer but the
    // last pair: a scan per string would read the rest of the text each time.
    const markdown = `${Array.from({length: 400}, (_, n) => `${'`'.repeat(n + 1)}a`).join(' ')} \`\`\`\`\`b\`\`\`\`\``;
    parseInlineAst(markdown);
    let fastest = Number.POSITIVE_INFINITY;
    for (let round = 0; round < 3; round++) {
      const started = performance.now();
      parseInlineAst(markdown);
      fastest = Math.min(fastest, performance.now() - started);
    }
    // Alone it takes a few milliseconds; the budget leaves room for a
    // loaded test machine.
    expect(fastest).toBeLessThan(1000);
  });
});
