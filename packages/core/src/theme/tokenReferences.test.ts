// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for the top-level CSS value scanners in tokenReferences.ts:
 * splitTopLevelComma and splitTopLevelWhitespace share one scan, so quotes,
 * escapes and parentheses read the same in both.
 */

import {describe, expect, it} from 'vitest';
import {splitTopLevelComma, splitTopLevelWhitespace} from './tokenReferences';

describe('splitTopLevelWhitespace', () => {
  it.each([
    ['clamp(8px, 2vw, 16px)', ['clamp(8px, 2vw, 16px)']],
    ['max(8px, 2vw)', ['max(8px, 2vw)']],
    ['calc(1px + (2px * 3)) 4px', ['calc(1px + (2px * 3))', '4px']],
    ['var(--a, "x y") 1px', ['var(--a, "x y")', '1px']],
    ['"a\\" b" 1px', ['"a\\" b"', '1px']],
    ["'it\\'s here' 2px", ["'it\\'s here'", '2px']],
    ['  8px  12px\t16px\n', ['8px', '12px', '16px']],
    ['', []],
    ['   ', []],
  ])('splits %j on top-level whitespace', (input, parts) => {
    expect(splitTopLevelWhitespace(input)).toEqual(parts);
  });
});

describe('splitTopLevelComma', () => {
  it.each([
    ['--a, 1px 2px', ['--a', '1px 2px']],
    ['--a, rgba(0, 0, 0, 0.5)', ['--a', 'rgba(0, 0, 0, 0.5)']],
    ['"x, y", z', ['"x, y"', 'z']],
    ['"a\\", b", c', ['"a\\", b"', 'c']],
  ])('splits %j on its first top-level comma', (input, parts) => {
    expect(splitTopLevelComma(input)).toEqual(parts);
  });

  it('answers null when there is no top-level comma', () => {
    expect(splitTopLevelComma('rgba(0, 0, 0)')).toBeNull();
    expect(splitTopLevelComma('"a, b"')).toBeNull();
  });
});
