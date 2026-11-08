// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import {diffInlineRanges} from './inlineDiff';

function changed(
  line: string,
  ranges: ReadonlyArray<readonly [number, number]>,
) {
  return ranges.map(([start, end]) => line.slice(start, end));
}

describe('diffInlineRanges', () => {
  it('reports the changed words on each side', () => {
    const a = 'const total = price * qty;';
    const b = 'const total = price * quantity;';
    const result = diffInlineRanges(a, b, 'word');
    expect(changed(a, result.old)).toEqual(['qty']);
    expect(changed(b, result.new)).toEqual(['quantity']);
  });

  it('reports a pure insertion only on the new side', () => {
    const a = 'f(a, b)';
    const b = 'f(a, b, c)';
    const result = diffInlineRanges(a, b, 'word');
    expect(result.old).toEqual([]);
    expect(changed(b, result.new)).toEqual([', c']);
  });

  it('bridges a whitespace gap between changed words', () => {
    const a = 'call(alpha beta, x, y, z)';
    const b = 'call(gamma delta, x, y, z)';
    const result = diffInlineRanges(a, b, 'word');
    expect(changed(a, result.old)).toEqual(['alpha beta']);
    expect(changed(b, result.new)).toEqual(['gamma delta']);
  });

  it('compares characters in char mode', () => {
    const a = 'color';
    const b = 'colour';
    const result = diffInlineRanges(a, b, 'char');
    expect(result.old).toEqual([]);
    expect(changed(b, result.new)).toEqual(['u']);
  });

  it('keeps UTF-16 offsets for characters outside the BMP', () => {
    const a = 'a😀b';
    const b = 'a😀c';
    const result = diffInlineRanges(a, b, 'char');
    expect(changed(a, result.old)).toEqual(['b']);
    expect(changed(b, result.new)).toEqual(['c']);
  });

  it('returns nothing for lines that share only whitespace', () => {
    expect(diffInlineRanges('foo bar', 'baz qux', 'word')).toEqual({
      old: [],
      new: [],
    });
  });

  it('returns nothing for mostly different lines', () => {
    // Only `=` and `;` in common.
    expect(
      diffInlineRanges('let total = 0;', 'const sum = items;', 'word'),
    ).toEqual({old: [], new: []});
  });

  it('drops whitespace-only ranges such as re-indentation', () => {
    const a = '  return value;';
    const b = '    return value + 1;';
    const result = diffInlineRanges(a, b, 'word');
    expect(result.old).toEqual([]);
    expect(changed(b, result.new)).toEqual([' + 1']);
  });

  it('returns nothing for identical, empty, or oversized lines', () => {
    expect(diffInlineRanges('same', 'same', 'word')).toEqual({
      old: [],
      new: [],
    });
    expect(diffInlineRanges('', 'x', 'word')).toEqual({old: [], new: []});
    const long = 'a'.repeat(600);
    expect(diffInlineRanges(long, `${long}b`, 'char')).toEqual({
      old: [],
      new: [],
    });
  });
});
