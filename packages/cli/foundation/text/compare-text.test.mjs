// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {compareText} from './compare-text.mjs';

describe('compareText', () => {
  it('ignores case first, then puts lowercase first', () => {
    expect(
      ['b', 'a-b', 'ab', 'Ab', 'a', 'ChatMessage', 'ai-chat'].sort(compareText),
    ).toEqual(['a', 'a-b', 'ab', 'Ab', 'ai-chat', 'b', 'ChatMessage']);
  });

  it('is equal only for identical strings', () => {
    expect(compareText('ide', 'ide')).toBe(0);
    expect(compareText('ide', 'IDE')).toBeLessThan(0);
    expect(compareText('IDE', 'ide')).toBeGreaterThan(0);
  });

  it('keeps the letters a locale moves in their plain order', () => {
    // Lithuanian collation puts "y" next to "i", Czech puts "ch" after "h",
    // and Turkish separates dotted and dotless "i".
    expect(
      ['yield', 'item', 'hero', 'chart', 'IDE', 'ide'].sort(compareText),
    ).toEqual(['chart', 'hero', 'ide', 'IDE', 'item', 'yield']);
  });
});
