// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for the main searcher (_main-searcher.mjs) through search():
 * it ranks by plain signals, answers the same every time, answers only with
 * lexical matches and never more of them, and touches no network. Run against
 * the real @astryxdesign/core.
 */

import {describe, it, expect, vi, afterEach} from 'vitest';
import * as path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
import {requireNatively} from '../../test-utils/native-require.mjs';

const require = requireNatively(import.meta.url);
/** @type {typeof import('./search.mjs')} */
const {search, searchCore} = require('./search.mjs');

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);
const QUERIES = [
  'date chooser',
  'show a confirmation before deleting',
  'toast notice for a saved draft',
  'grid of rows you can sort by column',
  'how do I install a theme',
  'page of settings with a side menu',
  'Bookmarkz',
  'qzxv',
];
/** @param {unknown} r */
const top = r =>
  /** @type {any} */ (r).data.results.map(x => `${x.domain}:${x.name}`);
/** @param {any} r */
const keyOf = r => `${r.domain}:${r.name}:${r.command}`;

afterEach(() => vi.restoreAllMocks());

describe('main searcher', () => {
  it('finds a component from what it does', async () => {
    expect(
      top(await search('show a confirmation before deleting', {cwd: REPO}))[0],
    ).toBe('component:AlertDialog');
    expect(top(await search('date chooser', {cwd: REPO}))[0]).toBe(
      'component:DateInput',
    );
  });

  it('answers a whole-name query exactly as the lexical ranker does', async () => {
    for (const q of ['Button', 'Dialog', 'useTheme', 'tokens']) {
      expect(top(await search(q, {cwd: REPO}))).toEqual(
        top(await searchCore(q, {cwd: REPO})),
      );
    }
  });

  it('answers a name typed with spaces for its dashes as the lexical ranker does', async () => {
    for (const q of ['author a theme', 'tokens data']) {
      expect(top(await search(q, {cwd: REPO}))).toEqual(
        top(await searchCore(q, {cwd: REPO})),
      );
    }
  });

  it('answers the same every time', async () => {
    for (const q of QUERIES.slice(0, 3)) {
      expect(top(await search(q, {cwd: REPO}))).toEqual(
        top(await search(q, {cwd: REPO})),
      );
    }
  });

  it(
    'answers each query with lexical matches, never more of them',
    {timeout: 120_000},
    async () => {
      for (const q of QUERIES) {
        const [mine, lexical, every] = [
          await search(q, {cwd: REPO}),
          await searchCore(q, {cwd: REPO}),
          await searchCore(q, {cwd: REPO, limit: Number.MAX_SAFE_INTEGER}),
        ];
        expect(mine.data.results.length).toBeLessThanOrEqual(
          lexical.data.results.length,
        );
        expect(mine.data.matchCount).toBe(lexical.data.matchCount);
        const byKey = new Map(every.data.results.map(r => [keyOf(r), r]));
        for (const r of mine.data.results) {
          const own = byKey.get(keyOf(r));
          expect(own, `${q}: ${keyOf(r)} is a lexical match`).toBeDefined();
          expect([r.score, r.reason]).toEqual([own?.score, own?.reason]);
        }
      }
    },
  );

  it('touches no network', async () => {
    const fail = () => {
      throw new Error('search reached the network');
    };
    vi.spyOn(http, 'request').mockImplementation(fail);
    vi.spyOn(https, 'request').mockImplementation(fail);
    vi.spyOn(net, 'connect').mockImplementation(fail);
    vi.spyOn(net.Socket.prototype, 'connect').mockImplementation(fail);
    vi.spyOn(globalThis, 'fetch').mockImplementation(fail);
    expect(
      top(await search('toast notice for a saved draft', {cwd: REPO}))[0],
    ).toBe('component:Toast');
  });
});
