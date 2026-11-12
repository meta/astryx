// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Search's synonym map: the table's shape, and that the lookup built
 * from it works in both directions, one group at a time. The test checks the
 * rules the map documents, not its words, so adding a group needs no test
 * change.
 */

import {describe, expect, it} from 'vitest';
import {SYNONYMS, SYNONYM_INDEX} from './_synonyms.mjs';

/** Every word of a group: its key and its values. */
const groupWords = (/** @type {string} */ key) => [key, ...SYNONYMS[key]];

describe('SYNONYMS', () => {
  it('holds only lowercase, trimmed, non-empty words', () => {
    for (const key of Object.keys(SYNONYMS))
      for (const word of groupWords(key)) {
        expect(typeof word, `${key}: ${word}`).toBe('string');
        expect(word, `${key}: ${word}`).toBe(word.trim().toLowerCase());
        expect(word.length, `${key}: ${word}`).toBeGreaterThan(0);
      }
  });

  it('gives every key at least one value', () => {
    for (const [key, values] of Object.entries(SYNONYMS))
      expect(values.length, key).toBeGreaterThan(0);
  });

  it('never lists a key among its own values', () => {
    for (const [key, values] of Object.entries(SYNONYMS))
      expect(values, key).not.toContain(key);
  });

  it('never lists a value twice in one group', () => {
    for (const [key, values] of Object.entries(SYNONYMS))
      expect(new Set(values).size, key).toBe(values.length);
  });
});

describe('SYNONYM_INDEX', () => {
  /**
   * The lookup the table documents, built from the table by its own rule: a
   * word expands to every other word of each group it belongs to.
   * @returns {Map<string, Set<string>>}
   */
  function expected() {
    /** @type {Map<string, Set<string>>} */
    const index = new Map();
    for (const key of Object.keys(SYNONYMS)) {
      const group = groupWords(key);
      for (const word of group) {
        const set = index.get(word) ?? new Set();
        for (const other of group) if (other !== word) set.add(other);
        index.set(word, set);
      }
    }
    return index;
  }

  it('gives each word the other words of every group it belongs to', () => {
    const want = expected();
    expect([...SYNONYM_INDEX.keys()].sort()).toEqual([...want.keys()].sort());
    for (const [word, set] of want)
      expect([...(SYNONYM_INDEX.get(word) ?? [])].sort(), word).toEqual(
        [...set].sort(),
      );
  });

  it('pulls in the key and its siblings when a value is typed', () => {
    for (const [key, values] of Object.entries(SYNONYMS))
      for (const value of values) {
        const found = SYNONYM_INDEX.get(value);
        expect(found?.has(key), `${value} -> ${key}`).toBe(true);
        for (const sibling of values)
          if (sibling !== value)
            expect(found?.has(sibling), `${value} -> ${sibling}`).toBe(true);
      }
  });

  it('pulls in every value when a key is typed', () => {
    for (const [key, values] of Object.entries(SYNONYMS))
      for (const value of values)
        expect(SYNONYM_INDEX.get(key)?.has(value), `${key} -> ${value}`).toBe(
          true,
        );
  });

  it('is symmetric: if a pulls in b, b pulls in a', () => {
    for (const [a, set] of SYNONYM_INDEX)
      for (const b of set)
        expect(SYNONYM_INDEX.get(b)?.has(a), `${a} <-> ${b}`).toBe(true);
  });

  it('never pulls a word in for itself', () => {
    for (const [word, set] of SYNONYM_INDEX)
      expect(set.has(word), word).toBe(false);
  });

  it('goes one group deep: a word reaches only the groups it is in', () => {
    // A word in two groups pulls both in, but a word in one of them does not
    // reach the other group through it.
    /** @type {Map<string, string[]>} */
    const groupsOf = new Map();
    for (const key of Object.keys(SYNONYMS))
      for (const word of groupWords(key))
        groupsOf.set(word, [...(groupsOf.get(word) ?? []), key]);
    for (const [word, set] of SYNONYM_INDEX) {
      const reachable = new Set(
        (groupsOf.get(word) ?? []).flatMap(key => groupWords(key)),
      );
      for (const other of set)
        expect(reachable.has(other), `${word} -> ${other}`).toBe(true);
    }
  });
});
