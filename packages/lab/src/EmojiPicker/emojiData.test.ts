// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {EMOJI_GROUPS} from './emojiData';

describe('bundled emoji data', () => {
  it('lists every CLDR group but the component group, in order', () => {
    expect(EMOJI_GROUPS.map(group => group.name)).toEqual([
      'Smileys & emotion',
      'People & body',
      'Animals & nature',
      'Food & drink',
      'Travel & places',
      'Activities',
      'Objects',
      'Symbols',
      'Flags',
    ]);
  });

  it('names every emoji once, with no skin-tone variants', () => {
    const emojis = EMOJI_GROUPS.flatMap(group => group.emojis);
    expect(emojis.length).toBeGreaterThan(1800);
    const characters = emojis.map(([emoji]) => emoji);
    expect(new Set(characters).size).toBe(characters.length);
    expect(emojis.every(([, name]) => name.trim() !== '')).toBe(true);
    // Skin tones are U+1F3FB through U+1F3FF.
    expect(characters.some(emoji => /[\u{1F3FB}-\u{1F3FF}]/u.test(emoji))).toBe(
      false,
    );
  });
});
