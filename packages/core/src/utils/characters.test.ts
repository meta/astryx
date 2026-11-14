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

describe('firstCharacter fast path', () => {
  // Independent reference: the same segmenter the slow path uses, called
  // directly so the fast path is checked against it, not against itself.
  const reference = new Intl.Segmenter(undefined, {granularity: 'grapheme'});
  const referenceFirst = (str: string): string => {
    const first = reference.segment(str)[Symbol.iterator]().next();
    return first.done ? '' : first.value.segment;
  };

  it('returns the first letter of an ASCII word', () => {
    expect(firstCharacter('Alice')).toBe('A');
  });

  it('returns a single-character string as is', () => {
    expect(firstCharacter('x')).toBe('x');
  });

  it('returns an empty string for an empty string', () => {
    expect(firstCharacter('')).toBe('');
  });

  it('keeps precomposed accented letters whole', () => {
    expect(firstCharacter('Zo\u00eb')).toBe('Z');
    expect(firstCharacter('\u00cbmile')).toBe('\u00cb');
    expect(firstCharacter('\u0141ukasz')).toBe('\u0141');
  });

  it('keeps a base letter with its combining accent', () => {
    expect(firstCharacter(`${E_ACUTE}cole`)).toBe(E_ACUTE);
  });

  it('does not split CR LF', () => {
    expect(firstCharacter('\r\nabc')).toBe('\r\n');
    expect(firstCharacter('\r')).toBe('\r');
  });

  it('keeps emoji, joined emoji, and flags whole', () => {
    expect(firstCharacter(`${EMOJI}a`)).toBe(EMOJI);
    expect(firstCharacter(`${FAMILY}a`)).toBe(FAMILY);
    expect(firstCharacter(`${FLAG}a`)).toBe(FLAG);
  });

  it('keeps a lone combining mark', () => {
    expect(firstCharacter('\u0301a')).toBe('\u0301');
  });

  it('defers to the segmenter when the first unit is U+0300 or above', () => {
    expect(firstCharacter('\u2764\ufe0f')).toBe('\u2764\ufe0f');
    expect(firstCharacter('\u06001')).toBe('\u06001');
  });

  it('defers to the segmenter when the second unit is U+0300 or above', () => {
    expect(firstCharacter('a\u200d')).toBe('a\u200d');
    expect(firstCharacter('a\u0300b')).toBe('a\u0300');
  });

  it('matches Intl.Segmenter for every first unit below U+0300 and a spread of next units', () => {
    const seconds = [
      null,
      0x00,
      0x0a,
      0x0d,
      0x1f,
      0x20,
      0x41,
      0x7f,
      0x9f,
      0xad,
      0xe9,
      0x2ff,
      0x300,
      0x301,
      0x200d,
      0x20e3,
      0xfe0f,
      0xd83d,
      0xdc00,
    ];
    const tails = ['', 'a', '\u0301', '\r\n'];
    let checked = 0;
    for (let first = 0; first < 0x300; first++) {
      for (const second of seconds) {
        for (const tail of tails) {
          const str =
            String.fromCharCode(first) +
            (second === null ? '' : String.fromCharCode(second)) +
            tail;
          expect(firstCharacter(str), JSON.stringify(str)).toBe(
            referenceFirst(str),
          );
          checked++;
        }
      }
    }
    expect(checked).toBe(0x300 * seconds.length * tails.length);
  });
});
