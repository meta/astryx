// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file characters.test.ts
 * @input character-counting utilities
 * @output Tests for characterCount, firstCharacter, truncateCharacters
 */

import {describe, it, expect, vi, afterEach} from 'vitest';
import {characterCount, firstCharacter, truncateCharacters} from './characters';

// Multi-code-unit fixtures: an emoji surrogate pair (2 units), a flag
// sequence (4 units), a ZWJ family (11 units), and a combining mark (2 units).
const EMOJI = '\u{1F600}'; // 😀
const FLAG = '\u{1F1F9}\u{1F1F7}'; // 🇹🇷
const FAMILY = '\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}'; // 👨‍👩‍👧‍👦
// é as base + combining mark, spelled as an escape so NFC-normalizing
// tools cannot silently precompose the fixture into single-code-unit é.
const E_ACUTE = 'e\u0301';

describe('characterCount', () => {
  it('returns 0 for the empty string', () => {
    expect(characterCount('')).toBe(0);
  });

  it('counts ASCII one per character', () => {
    expect(characterCount('hello')).toBe(5);
  });

  it('counts an emoji surrogate pair as one', () => {
    expect(characterCount(EMOJI.repeat(2))).toBe(2);
    expect(EMOJI.repeat(2).length).toBe(4); // sanity: code units differ
  });

  it('counts a flag sequence as one', () => {
    expect(characterCount(FLAG)).toBe(1);
  });

  it('counts a ZWJ family emoji as one', () => {
    expect(characterCount(FAMILY)).toBe(1);
    expect(FAMILY.length).toBe(11); // sanity: code units differ
  });

  it('counts a combining-mark character as one', () => {
    expect(characterCount(E_ACUTE)).toBe(1);
    expect(E_ACUTE.length).toBe(2); // sanity: code units differ
  });

  it('counts mixed content by user-perceived characters', () => {
    expect(characterCount(`a${EMOJI}b`)).toBe(3);
  });
});

describe('firstCharacter', () => {
  it('returns the empty string for the empty string', () => {
    expect(firstCharacter('')).toBe('');
  });

  it('returns the first ASCII character', () => {
    expect(firstCharacter('abc')).toBe('a');
  });

  it('returns a whole emoji, not half a surrogate pair', () => {
    expect(firstCharacter(`${EMOJI}x`)).toBe(EMOJI);
  });

  it('returns a whole ZWJ family emoji', () => {
    expect(firstCharacter(`${FAMILY}x`)).toBe(FAMILY);
  });

  it('keeps a combining mark attached to its base', () => {
    expect(firstCharacter(`${E_ACUTE}cole`)).toBe(E_ACUTE);
  });
});

describe('firstCharacter matches a full grapheme segmentation', () => {
  const segmenter = new Intl.Segmenter(undefined, {granularity: 'grapheme'});
  function segmentedFirst(str: string): string {
    const first = segmenter.segment(str)[Symbol.iterator]().next();
    return first.done ? '' : first.value.segment;
  }

  it('agrees on every first code unit below U+0300, before any second code unit that can follow it', () => {
    // Second code units: none, ASCII and Latin, controls (CR, LF), every
    // kind that can extend a cluster (combining marks, ZWJ, variation and
    // emoji modifiers, enclosing keycap), and characters that start their
    // own clusters (CJK, Hangul, Devanagari, Arabic, a surrogate pair).
    const seconds = [
      '',
      'a',
      'Z',
      '0',
      ' ',
      '.',
      '\r',
      '\n',
      '\u00e9',
      '\u00ad',
      '\u02b0',
      '\u0301',
      '\u0308\u0301',
      '\u036f',
      '\u200d',
      '\u200c',
      '\ufe0f',
      '\ufe0e',
      '\u20e3',
      '\ufe0f\u20e3',
      '\u0903',
      '\u0915',
      '\u0627',
      '\u05d0',
      '\u4e2d',
      '\u1100',
      '\u1161',
      '\uac00',
      '\u{1f3fb}',
      '\u{1f600}',
      '\u{1f1fa}\u{1f1f8}',
    ];
    const mismatches: string[] = [];
    for (let code = 0; code < 0x300; code += 1) {
      const base = String.fromCharCode(code);
      for (const second of seconds) {
        const str = `${base}${second}x`;
        if (firstCharacter(str) !== segmentedFirst(str)) {
          mismatches.push(JSON.stringify(str));
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it.each([
    ['empty', ''],
    ['one ASCII character', 'J'],
    ['one precomposed letter', '\u00c9'],
    ['CR LF', '\r\nx'],
    ['ZWJ family emoji', '\u{1f468}\u200d\u{1f469}\u200d\u{1f467}x'],
    ['skin-tone emoji', '\u{1f44b}\u{1f3fd}x'],
    ['regional-indicator flag', '\u{1f1fa}\u{1f1f8}x'],
    ['keycap', '1\ufe0f\u20e3x'],
    ['combining marks', 'e\u0301\u0323x'],
    ['Hangul jamo', '\u1100\u1161\u11a8x'],
    ['Devanagari conjunct', '\u0915\u094d\u0937x'],
    ['Arabic', '\u0645\u062d\u0645\u062fx'],
    ['Hebrew with points', '\u05e9\u05c1\u05b8x'],
    ['CJK', '\u4e2d\u6587'],
    ['leading space', ' Ada'],
    ['leading punctuation', "(O'Brien)"],
  ])('agrees on %s', (_, str) => {
    expect(firstCharacter(str)).toBe(segmentedFirst(str));
  });
});

describe('truncateCharacters', () => {
  it('returns strings within max unchanged', () => {
    expect(truncateCharacters('abc', 5)).toBe('abc');
  });

  it('returns strings exactly at max unchanged', () => {
    expect(truncateCharacters('abcde', 5)).toBe('abcde');
  });

  it('truncates so the result, including the ellipsis, is max characters', () => {
    expect(truncateCharacters('abcdefghij', 5)).toBe('abcd…');
  });

  it('counts a multi-character ellipsis against max', () => {
    // "..." is 3 characters, so 5 content characters remain.
    expect(truncateCharacters('aaaaaaaaaa', 8, '...')).toBe('aaaaa...');
  });

  it('passes strings within max through under a multi-character ellipsis', () => {
    expect(truncateCharacters('aaaaaaaa', 8, '...')).toBe('aaaaaaaa');
  });

  it('cuts between characters, never splitting an emoji', () => {
    // The exact-string assertion also proves no surrogate pair was split.
    expect(truncateCharacters(EMOJI.repeat(4), 3)).toBe(`${EMOJI.repeat(2)}…`);
  });

  it('treats a ZWJ family emoji as a single unit when cutting', () => {
    expect(truncateCharacters(`${FAMILY}abc`, 2)).toBe(`${FAMILY}…`);
  });

  it('returns the empty string unchanged', () => {
    expect(truncateCharacters('', 5)).toBe('');
  });

  it('degrades to just the ellipsis when max is smaller than the ellipsis', () => {
    // Documented degenerate behavior: no consumer passes max below the
    // ellipsis length, but the clamp must stay predictable.
    expect(truncateCharacters('abcdef', 2, '...')).toBe('...');
    expect(truncateCharacters('abcdef', 0)).toBe('…');
  });
});

describe('code-point fallback (no Intl.Segmenter)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('keeps surrogate pairs intact while counting by code points', async () => {
    vi.resetModules();
    // characters.ts only reads Intl.Segmenter, so a minimal stub suffices.
    vi.stubGlobal('Intl', {Segmenter: undefined});
    const fallback = await import('./characters');

    expect(fallback.characterCount(EMOJI.repeat(2))).toBe(2);
    expect(fallback.firstCharacter(`${EMOJI}x`)).toBe(EMOJI);
    expect(fallback.firstCharacter('')).toBe('');
    expect(fallback.truncateCharacters(EMOJI.repeat(4), 3)).toBe(
      `${EMOJI.repeat(2)}…`,
    );
    // Documented degradation: a flag sequence splits into its two
    // regional-indicator code points under the fallback.
    expect(fallback.characterCount(FLAG)).toBe(2);
  });
});
