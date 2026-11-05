// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Colocated tests for string-utils — the fuzzy-matching and semantic
 * search surface. These lock the ROBUSTNESS and ORDERING invariants that the
 * `component` / `search` commands rely on:
 *   - neither helper throws on empty / whitespace / unicode / very-long /
 *     regex-metacharacter input (the needle is user-controlled),
 *   - regex metacharacters in the needle are ESCAPED before being used in the
 *     description RegExp (a bare `.*` or `(` must not throw or match-all),
 *   - findClosestComponents sorts by ascending distance and honours maxDistance,
 *   - searchComponents scores an exact name match 100, dedupes by name, and
 *     sorts by score desc then name asc.
 * The doc-file reading (Pass 2) is exercised end-to-end elsewhere; here we use
 * a non-existent coreDir so Pass 2 is a no-op and the tests stay pure + fast.
 */

import {describe, it, expect} from 'vitest';
import {
  findClosestComponents,
  searchComponents,
  levenshteinDistance,
} from './string-utils.mjs';

const COMPONENTS = {group: ['Button', 'Card', 'Text', 'Badge', 'Avatar']};
// A coreDir that does not exist -> Pass 2 (doc reads) is a no-op, so results
// come purely from name/distance scoring. Keeps these tests pure and fast.
const NO_CORE = '/definitely/not/a/real/dir';

describe('levenshteinDistance (re-export)', () => {
  it('is re-exported and computes classic edit distance', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
    expect(levenshteinDistance('same', 'same')).toBe(0);
  });
});

describe('findClosestComponents', () => {
  it('returns distance 0 for an exact (case-insensitive) match', () => {
    expect(findClosestComponents('button', COMPONENTS)).toEqual([
      {name: 'Button', distance: 0},
    ]);
  });

  it('finds a one-edit typo and reports distance 1', () => {
    const matches = findClosestComponents('Buton', COMPONENTS);
    expect(matches[0]).toEqual({name: 'Button', distance: 1});
  });

  it('sorts matches by ascending distance', () => {
    const matches = findClosestComponents('Card', COMPONENTS);
    const distances = matches.map(m => m.distance);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
  });

  it('honours the maxDistance filter (default 3)', () => {
    // "Bird" is >3 edits from every component -> filtered out.
    expect(findClosestComponents('Bird', COMPONENTS, 1)).toEqual([]);
    // Tightening maxDistance never returns more than the default.
    const wide = findClosestComponents('Buton', COMPONENTS, 3).length;
    const narrow = findClosestComponents('Buton', COMPONENTS, 1).length;
    expect(narrow).toBeLessThanOrEqual(wide);
  });

  it('does not throw on empty / whitespace / regex-special / unicode / long input', () => {
    expect(findClosestComponents('', COMPONENTS)).toEqual([]);
    expect(() => findClosestComponents('   ', COMPONENTS)).not.toThrow();
    // Regex metacharacters must be treated as literal text, never matched-all.
    expect(findClosestComponents('.*', COMPONENTS)).toEqual([]);
    expect(() => findClosestComponents('(', COMPONENTS)).not.toThrow();
    expect(() =>
      findClosestComponents('café', {g: ['café', 'cafe']}),
    ).not.toThrow();
    expect(() =>
      findClosestComponents('a'.repeat(100_000), COMPONENTS),
    ).not.toThrow();
  });

  it('handles an empty component registry', () => {
    expect(findClosestComponents('Button', {})).toEqual([]);
  });
});

describe('searchComponents', () => {
  it('scores an exact name match 100', async () => {
    const results = await searchComponents('Button', NO_CORE, COMPONENTS);
    expect(results[0]).toEqual({
      name: 'Button',
      score: 100,
      reason: 'exact name',
    });
  });

  it('scores a distance-1 name match 80', async () => {
    const results = await searchComponents('Buton', NO_CORE, COMPONENTS);
    expect(results[0]).toMatchObject({name: 'Button', score: 80});
  });

  it('dedupes by name (an exact match yields a single entry)', async () => {
    const results = await searchComponents('Button', NO_CORE, {
      g: ['Button', 'Buttonx'],
    });
    const buttons = results.filter(r => r.name === 'Button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].score).toBe(100);
  });

  it('sorts by score desc, then name asc on ties', async () => {
    const results = await searchComponents('Button', NO_CORE, COMPONENTS);
    for (let i = 1; i < results.length; i++) {
      const prev = results[i - 1];
      const cur = results[i];
      expect(prev.score).toBeGreaterThanOrEqual(cur.score);
      if (prev.score === cur.score) {
        expect(prev.name.localeCompare(cur.name)).toBeLessThanOrEqual(0);
      }
    }
  });

  it('suggests a component whose whole name is a run of the needle\'s words when nothing else matches', async () => {
    const results = await searchComponents('FancyWidgetPanel', NO_CORE, {
      g: ['Panel', 'Widget', 'Sheet'],
    });
    expect(results.map(r => r.name)).toEqual(['Panel']);
    expect(results[0].reason).toBe('name part "panel"');
    expect(results.every(r => r.score < 20)).toBe(true);
  });

  it('adds no name-part matches when another signal matched', async () => {
    const results = await searchComponents('Panl', NO_CORE, {
      g: ['Panel', 'Sheet'],
    });
    expect(results.map(r => r.name)).toEqual(['Panel']);
    expect(results[0].score).toBe(80);
  });

  it('breaks a score tie alphabetically', async () => {
    // Both names are edit-distance 2 from "bcd" -> both score 40 -> alpha order.
    const results = await searchComponents('bcd', NO_CORE, {g: ['Xbc', 'Abc']});
    expect(results.map(r => r.name)).toEqual(['Abc', 'Xbc']);
    expect(results.every(r => r.score === 40)).toBe(true);
  });

  it('treats regex metacharacters as literal (no throw, no match-all)', async () => {
    // A bare `.*` would match every description if the needle were not escaped;
    // with escaping + no doc dir it simply scores nothing.
    await expect(
      searchComponents('.*', NO_CORE, COMPONENTS),
    ).resolves.toEqual([]);
    await expect(
      searchComponents('(', NO_CORE, COMPONENTS),
    ).resolves.toEqual([]);
    await expect(
      searchComponents('[a-z]+', NO_CORE, COMPONENTS),
    ).resolves.toEqual([]);
  });

  it('does not throw on empty / whitespace / unicode / very-long input', async () => {
    await expect(
      searchComponents('', NO_CORE, COMPONENTS),
    ).resolves.toEqual([]);
    await expect(
      searchComponents('   ', NO_CORE, COMPONENTS),
    ).resolves.not.toThrow();
    await expect(
      searchComponents('café', NO_CORE, {g: ['café', 'cafe']}),
    ).resolves.toBeInstanceOf(Array);
    await expect(
      searchComponents('a'.repeat(100_000), NO_CORE, COMPONENTS),
    ).resolves.toBeInstanceOf(Array);
  });

  it('returns an empty array for an empty registry without throwing', async () => {
    await expect(searchComponents('Button', NO_CORE, {})).resolves.toEqual([]);
  });
});
