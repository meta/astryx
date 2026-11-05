// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Unit tests for levenshteinDistance — the fuzzy-suggestion primitive
 * behind "did you mean" errors across component/hook/discover/theme. Had no
 * coverage; these lock the edge cases (empty strings, symmetry, unicode).
 */

import {describe, it, expect} from 'vitest';
import {levenshteinDistance as d} from './levenshtein.mjs';

describe('levenshteinDistance', () => {
  it('is 0 for identical strings', () => {
    expect(d('Button', 'Button')).toBe(0);
    expect(d('', '')).toBe(0);
  });

  it('handles empty inputs (distance = other length)', () => {
    expect(d('', 'abc')).toBe(3);
    expect(d('abc', '')).toBe(3);
  });

  it('computes the classic kitten/sitting distance', () => {
    expect(d('kitten', 'sitting')).toBe(3);
  });

  it('is symmetric', () => {
    expect(d('abc', 'xyz')).toBe(d('xyz', 'abc'));
    expect(d('Button', 'Buttonn')).toBe(d('Buttonn', 'Button'));
  });

  it('counts a single substitution/insertion for near-miss names', () => {
    expect(d('Button', 'Buttonn')).toBe(1);
    expect(d('useMediaQuery', 'usemediaquery')).toBe(2); // M->m and Q->q
  });

  it('handles unicode', () => {
    expect(d('café', 'cafe')).toBe(1);
  });

  it('short-circuits pairs whose length gap exceeds every caller threshold', () => {
    // The DoS guard bails out with a large sentinel once |m − n| > 5, so a
    // pathological long query never runs the O(m·n) DP.
    expect(d('a', 'a'.repeat(10_000))).toBe(999);
  });

  it('still computes the true distance up to a length gap of 5', () => {
    // The gap must stay ≥ the loosest caller threshold (hook suggester = 5),
    // so a real 5-away typo isn't dropped by the short-circuit.
    expect(d('use', 'useMedia')).toBe(5); // 5 pure insertions
  });

  it('answers max + 1 past an optional bound, and the distance within it', () => {
    const words = ['kitten', 'sitting', 'mitten', 'kitchen', 'knitting', 'kit'];
    for (const a of words) {
      for (const b of words) {
        const full = d(a, b);
        for (let max = 0; max <= 5; max++) {
          const within = full <= max ? full : max + 1;
          expect(d(a, b, max), `${a} ${b} ${max}`).toBe(within);
        }
      }
    }
  });
});

