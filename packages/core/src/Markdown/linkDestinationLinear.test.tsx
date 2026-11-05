// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {parseInlineAst} from './parser';

type Json = {type: string; url?: string; value?: string; children?: Json[]};

/** Each link's or image's URL, in order. */
function urls(markdown: string): string[] {
  const found: string[] = [];
  const visit = (node: Json) => {
    if (node.type === 'link' || node.type === 'image') {
      found.push(node.url ?? '');
    }
    (node.children ?? []).forEach(visit);
  };
  (parseInlineAst(markdown) as unknown as Json[]).forEach(visit);
  return found;
}

/** The fastest of three parses of `markdown`, in milliseconds. */
function parseTime(markdown: string): number {
  parseInlineAst(markdown);
  let fastest = Number.POSITIVE_INFINITY;
  for (let round = 0; round < 3; round++) {
    const started = performance.now();
    parseInlineAst(markdown);
    fastest = Math.min(fastest, performance.now() - started);
  }
  return fastest;
}

describe('link destinations end where their parentheses balance', () => {
  it.each([
    ['[a](b(c)d)', ['b(c)d']],
    ['[a](b((c))d) and [e](f)', ['b((c))d', 'f']],
    ['[a](b\\)c)', ['b)c']],
    ['![i](a(b)c)', ['a(b)c']],
    ['[a](b(c) and [e](f)', ['f']],
  ])('reads %j', (markdown, expected) => {
    expect(urls(markdown)).toEqual(expected);
  });

  it.each([
    ['links with unclosed destinations', '[a](b '.repeat(20_000)],
    ['images with unclosed destinations', '![a](b '.repeat(20_000)],
    ['unclosed nested parentheses', '[a](('.repeat(20_000)],
    ['one closing parenthesis at the end', `${'[a]('.repeat(20_000)})`],
  ])('reads %s in linear time', (_, markdown) => {
    // Alone, each takes about 10 ms; the budget leaves room for a loaded
    // test machine. Searching every destination to the end took 4 to 13 s.
    expect(parseTime(markdown)).toBeLessThan(1000);
  });
});
