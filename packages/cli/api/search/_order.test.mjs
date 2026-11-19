// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Invariants of search's ordering, checked against the lexical ranker on
 * the real catalog: search answers only with lexical matches, keeps each one's
 * score and reason, and never moves a match past one of another band or kind,
 * except a family root the lexical ranker marks as leading its part, which
 * moves directly before the part.
 */

import {describe, it, expect} from 'vitest';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {requireNatively} from '../../test-utils/native-require.mjs';

const require = requireNatively(import.meta.url);
/** @type {typeof import('./search.mjs')} */
const {search, searchCore} = require('./search.mjs');
/** @type {typeof import('./_order.mjs')} */
const {bandOf} = require('./_order.mjs');
/** @type {typeof import('./_adapter.mjs')} */
const {gatherCandidatesReused} = require('./_adapter.mjs');

const cwd = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);

/** @param {any} r */
const keyOf = r => `${r.domain}:${r.name}:${r.command}`;
/** @param {any} r */
const runOf = r => `${bandOf(r.score ?? 0)}:${r.domain === 'doc'}`;

const QUERIES = [
  'account settings',
  'table of contents',
  'content',
  'dark mode',
  'illustration',
  'date picker in a card',
  'how do I add a theme',
  'button',
  'side panel that resizes',
  // A part whose name hit scores a band above its family's root.
  'code sample',
  'tab layout',
];

/** Each family member's `domain:name`, mapped to its family's root. */
const familyOf = async () => {
  const {all} = await gatherCandidatesReused({cwd});
  return new Map(
    all.flatMap(c => (c._family ? [[`${c.domain}:${c.name}`, c._family]] : [])),
  );
};

describe('search ordering invariants', () => {
  for (const q of QUERIES) {
    it(`keeps the lexical matches, bands and kinds for "${q}"`, async () => {
      const ours = await search(q, {cwd, limit: 50});
      const lexical = await searchCore(q, {
        cwd,
        limit: Number.MAX_SAFE_INTEGER,
        ownKeywords: true,
      });
      expect(ours.data.matchCount).toBe(lexical.data.matchCount);
      expect(ours.data.results.length).toBeLessThanOrEqual(
        Math.min(50, lexical.data.matchCount),
      );
      /** @type {Map<string, number>} */
      const at = new Map(lexical.data.results.map((r, i) => [keyOf(r), i]));
      const byKey = new Map(lexical.data.results.map(r => [keyOf(r), r]));
      for (const r of ours.data.results) {
        const own = byKey.get(keyOf(r));
        expect(own, `${keyOf(r)} is a lexical match`).toBeDefined();
        expect(r.score).toBe(own?.score);
        expect(r.reason).toBe(own?.reason);
      }
      // Two results of different runs (band or kind) keep the lexical order,
      // except a family root directly before a part of its own family.
      const rs = ours.data.results;
      const families = await familyOf();
      /** @param {number} i */
      const rootOfNext = i =>
        i + 1 < rs.length &&
        rs[i + 1].domain === rs[i].domain &&
        families.get(
          keyOf(rs[i + 1])
            .split(':')
            .slice(0, 2)
            .join(':'),
        ) === rs[i].name;
      for (let i = 0; i < rs.length; i++) {
        if (rootOfNext(i)) continue;
        for (let j = i + 1; j < rs.length; j++) {
          if (runOf(rs[i]) === runOf(rs[j])) continue;
          expect(
            /** @type {number} */ (at.get(keyOf(rs[i]))) <
              /** @type {number} */ (at.get(keyOf(rs[j]))),
            `${keyOf(rs[i])} above ${keyOf(rs[j])}`,
          ).toBe(true);
        }
      }
    }, 60_000);
  }

  it('moves a marked root directly before its part, across bands', async () => {
    const names = (await search('code sample', {cwd, limit: 20})).data.results
      .filter(r => r.domain === 'component')
      .map(r => r.name);
    const root = names.indexOf('CodeBlock');
    expect(root).toBeGreaterThanOrEqual(0);
    expect(names[root + 1]).toBe('Code');
  }, 60_000);
});
