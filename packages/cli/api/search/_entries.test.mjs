// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The entry index is reused while the catalog's text is unchanged, so
 * every field it reads must be part of the hash that decides reuse.
 */

import {describe, it, expect} from 'vitest';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gatherCandidates, loadSearchData} from './_adapter.mjs';
import {HASHED_FIELDS, buildTable, entryTable} from './_entries.mjs';

const cwd = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);

describe('entry index cache', () => {
  it('hashes every candidate field the index reads', async () => {
    const {all} = await gatherCandidates({cwd});
    /** @type {Set<string>} */
    const read = new Set();
    const watched = all.map(
      c =>
        new Proxy(c, {
          get(target, key, receiver) {
            if (typeof key === 'string') read.add(key);
            return Reflect.get(target, key, receiver);
          },
        }),
    );
    buildTable(watched, loadSearchData().cards);
    const unhashed = [...read].filter(k => !HASHED_FIELDS.includes(k));
    expect(unhashed).toEqual([]);
  }, 60_000);

  it('rebuilds when a candidate text changes and reuses it otherwise', async () => {
    const {all} = await gatherCandidates({cwd});
    const {cards} = loadSearchData();
    const first = entryTable([...all], cards);
    expect(entryTable([...all], cards)).toBe(first);
    const changed = all.map((c, i) =>
      i === 0 ? {...c, description: `${c.description ?? ''} changed`} : c,
    );
    expect(entryTable(changed, cards)).not.toBe(first);
  }, 60_000);
});
