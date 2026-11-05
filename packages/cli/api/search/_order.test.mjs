// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Invariants of search's ordering, checked against the lexical ranker on
 * the real catalog: search answers only with lexical matches, keeps each one's
 * score and reason, and never moves a match past one of another band or kind.
 */

import {describe, it, expect} from 'vitest';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {search, searchCore} from './search.mjs';
import {bandOf} from './_order.mjs';

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
];

describe('search ordering invariants', () => {
  for (const q of QUERIES) {
    it(`keeps the lexical matches, bands and kinds for "${q}"`, async () => {
      const ours = await search(q, {cwd, limit: 50});
      const lexical = await searchCore(q, {
        cwd,
        limit: Number.MAX_SAFE_INTEGER,
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
      // Two results of different runs (band or kind) keep the lexical order.
      const rs = ours.data.results;
      for (let i = 0; i < rs.length; i++) {
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
});
