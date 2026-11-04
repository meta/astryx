// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {parseInlineAst} from './parser';
import {isSafeMarkdownParserUrl} from './url';

type Json = {type: string; url?: string; value?: string; children?: Json[]};

/** Each link or image as `type(url)`, in order. */
function targets(markdown: string): string[] {
  const found: string[] = [];
  const visit = (node: Json) => {
    if (node.type === 'link' || node.type === 'image') {
      found.push(`${node.type}(${node.url})`);
    }
    (node.children ?? []).forEach(visit);
  };
  (parseInlineAst(markdown) as unknown as Json[]).forEach(visit);
  return found;
}

describe('angle-bracket destinations (CommonMark 0.31 §6.3)', () => {
  it.each([
    ['[a](<b(c>)', ['link(b(c)']],
    ['[a](<b(c> "t")', ['link(b(c)']],
    ['[a](< b(c) d >)', ['link( b(c) d )']],
    ['![i](<b(c>)', ['image(b(c)']],
    ['[a](<b\\>c>)', ['link(b>c)']],
    ['[a](<b\\<c>)', ['link(b<c)']],
    ['[a](<>)', ['link()']],
    ['[a](<b\nc>)', []],
    ['[a](<b>c>)', []],
    ['![i](<b>c>)', []],
    ['[a](<b)', []],
    ['[a](<b c)', []],
    ['[link](<foo\\>)', []],
    ['[a](<b<c>)', []],
    ['[a](<b\\\nc>)', []],
    ['[a](b c)', ['link(b c)']],
    ['[a](<b(c>) and [d](e)', ['link(b(c)', 'link(e)']],
  ])('reads %j', (markdown, expected) => {
    expect(targets(markdown)).toEqual(expected);
  });

  it('refuses every unsafe scheme, however its angle destination is written', () => {
    let state = 31;
    const random = () => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state / 2147483648;
    };
    const pick = <T,>(items: ReadonlyArray<T>): T =>
      items[Math.floor(random() * items.length)];
    const schemes = [
      'javascript:',
      'JaVaScRiPt:',
      '&#106;avascript:',
      '&#x6A;avascript:',
      'java\\script:',
      'vbscript:',
      'data:text/html,',
      'data: text/html,',
      'data:&#32;text/html,',
    ];
    for (let round = 0; round < 500; round++) {
      const body = pick([
        'x',
        'a(b)',
        'a(b',
        'a\\>b',
        'a\\<b',
        ' x ',
        '',
        'a>b',
        'a<b',
        'a\\',
        'a\\\nb',
      ]);
      const title = pick(['', ' "t"', " 't'", ' (t)']);
      const markdown = `${pick(['[a]', '![a]'])}(${pick(['', ' '])}<${pick(schemes)}${body}>${title})`;
      for (const target of targets(markdown)) {
        const url = target.slice(target.indexOf('(') + 1, -1);
        expect(isSafeMarkdownParserUrl(url), markdown).toBe(true);
      }
    }
  });

  it('finds angle destinations in linear time', () => {
    for (const markdown of [
      '[a](<b '.repeat(20_000),
      '[a](<b> ('.repeat(20_000),
      '[a](<b> "'.repeat(20_000),
    ]) {
      parseInlineAst(markdown);
      let fastest = Number.POSITIVE_INFINITY;
      for (let round = 0; round < 3; round++) {
        const started = performance.now();
        parseInlineAst(markdown);
        fastest = Math.min(fastest, performance.now() - started);
      }
      // The budget leaves room for a loaded test machine.
      expect(fastest, markdown.slice(0, 12)).toBeLessThan(1000);
    }
  });
});
