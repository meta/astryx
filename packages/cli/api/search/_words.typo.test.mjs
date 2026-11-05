// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file typoDistance (_words.mjs) gives the answer the full edit distance and
 * isTypo give together, for every pair, and search's scoring computes no
 * full edit-distance table.
 */

import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it, vi} from 'vitest';

const fullTables = vi.hoisted(() => ({count: 0}));

vi.mock('../../foundation/text/levenshtein.mjs', async importOriginal => {
  /** @type {typeof import('../../foundation/text/levenshtein.mjs')} */
  const original = await importOriginal();
  return {
    ...original,
    /** @param {string} a @param {string} b @param {number} [max] */
    levenshteinDistance: (a, b, max) => {
      if (max === undefined) fullTables.count += 1;
      return original.levenshteinDistance(a, b, max);
    },
  };
});

const {levenshteinDistance} =
  await import('../../foundation/text/levenshtein.mjs');
const {isTypo, typoDistance} = await import('./_words.mjs');
const {searchCore} = await import('./search.mjs');

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);

/**
 * What the scoring used before: the full distance, kept when isTypo allows it.
 * @param {string} a
 * @param {string} b
 */
function fullAnswer(a, b) {
  const dist = levenshteinDistance(a, b);
  return isTypo(a, b, dist) ? dist : null;
}

/**
 * Seeded words of five to fourteen letters, each beside copies one to four
 * random edits away, so the pairs cover typos at every distance that counts.
 * @param {number} count
 * @returns {string[]}
 */
function seededWords(count) {
  let seed = 7;
  const next = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed;
  };
  const letter = () => 'abcdefgh'[next() % 8];
  const words = [];
  for (let i = 0; i < count; i++) {
    let word = '';
    for (let j = 0, length = 5 + (next() % 10); j < length; j++) {
      word += letter();
    }
    words.push(word);
    for (let edits = 1; edits <= 4; edits++) {
      let copy = word;
      for (let e = 0; e < edits; e++) {
        const at = next() % copy.length;
        const kind = next() % 3;
        copy =
          kind === 0
            ? copy.slice(0, at) + letter() + copy.slice(at + 1)
            : kind === 1
              ? copy.slice(0, at) + letter() + copy.slice(at)
              : copy.slice(0, at) + copy.slice(at + 1);
      }
      words.push(copy);
    }
  }
  return words;
}

describe('typoDistance', () => {
  it('gives the full distance and isTypo answer for every pair', () => {
    const words = [
      ...seededWords(80),
      'dashboard',
      'dashbaord',
      'dashboards',
      'datepicker',
      'datepickr',
      'notification',
      'notifcation',
      'pagination',
      'paginator',
    ];
    let typos = 0;
    for (const a of words) {
      for (const b of words) {
        const answer = fullAnswer(a, b);
        expect(typoDistance(a, b), `${a} ${b}`).toBe(answer);
        if (answer != null) typos += 1;
      }
    }
    // The pairs include typos at every distance that can count.
    expect(typos).toBeGreaterThan(300);
  });

  it('keeps search finding a typed name, with no full distance table', async () => {
    fullTables.count = 0;
    const response = await searchCore('dashbaord', {cwd: REPO});
    expect(response.data.results.length).toBeGreaterThan(0);
    expect(fullTables.count).toBe(0);
  });
});
