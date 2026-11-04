// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {parseInlineAst} from './parser';

type Json = {type: string; value?: string};

const types = (markdown: string): string[] =>
  (parseInlineAst(markdown) as unknown as Json[]).map(node =>
    node.type === 'text' ? `text(${node.value})` : node.type,
  );

describe('a hard line break from trailing spaces (CommonMark 0.31 §6.7)', () => {
  it.each([
    ['two spaces break the line', 'a  \nb', ['text(a)', 'break', 'text(b)']],
    ['more spaces break it too', 'a     \nb', ['text(a)', 'break', 'text(b)']],
    ['one space is a soft break', 'a \nb', ['text(a \nb)']],
    [
      'a CRLF line ending keeps its break',
      'a  \r\nb',
      ['text(a)', 'break', 'text(b)'],
    ],
    ['spaces inside the line stay text', 'a   b\nc', ['text(a   b\nc)']],
  ])('%s: %j', (_, markdown, expected) => {
    expect(types(markdown)).toEqual(expected);
  });

  it.each([
    ['one line with a long run of spaces', `a${' '.repeat(40_000)}b\nc`],
    ['many lines with runs of spaces', `a${' '.repeat(1_000)}b\n`.repeat(40)],
    ['a long run of spaces ending the line', `a${' '.repeat(40_000)}\nb`],
  ])('reads %s (40 KB) within 100 ms', (_, markdown) => {
    // CPU time, not elapsed time: on a loaded test machine, other work
    // stretches elapsed time but not the time this parse spends computing.
    parseInlineAst(markdown);
    let least = Number.POSITIVE_INFINITY;
    for (let round = 0; round < 5; round++) {
      const started = process.cpuUsage();
      parseInlineAst(markdown);
      const used = process.cpuUsage(started);
      least = Math.min(least, (used.user + used.system) / 1000);
    }
    expect(least).toBeLessThan(100);
  });
});
