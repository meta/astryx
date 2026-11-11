// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests that a cold gather (_adapter.mjs) lists each folder about once
 * when its caller runs no listing-cache operation of its own, as the search
 * tests do. Run against the real @astryxdesign/core.
 */

import {describe, expect, it} from 'vitest';
import {createRequire, syncBuiltinESMExports} from 'node:module';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gatherCandidates} from './_adapter.mjs';

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);

/** node:fs's module object, whose functions every import of it shares. */
const fs = createRequire(import.meta.url)('node:fs');

/**
 * Run `run` and count the folder listings it makes, by folder.
 * @param {() => Promise<unknown>} run
 * @returns {Promise<Map<string, number>>}
 */
async function countListings(run) {
  /** @type {Map<string, number>} */
  const listings = new Map();
  const readdirSync = fs.readdirSync;
  /**
   * @this {unknown}
   * @param {any} dir
   * @param {...any} rest
   */
  fs.readdirSync = function (dir, ...rest) {
    const folder = path.resolve(
      dir instanceof URL ? fileURLToPath(dir) : String(dir),
    );
    listings.set(folder, (listings.get(folder) ?? 0) + 1);
    return readdirSync.call(this, dir, ...rest);
  };
  // ESM imports of node:fs see the counting function too.
  syncBuiltinESMExports();
  try {
    await run();
  } finally {
    fs.readdirSync = readdirSync;
    syncBuiltinESMExports();
  }
  return listings;
}

describe('gatherCandidates', () => {
  it('lists each folder about once in a cold gather', async () => {
    const listings = await countListings(() => gatherCandidates({cwd: REPO}));
    const calls = [...listings.values()].reduce((sum, n) => sum + n, 0);
    // A few readers list a folder outside the cache, so a folder may be listed
    // twice.
    expect(
      calls,
      `${calls} listings of ${listings.size} folders`,
    ).toBeLessThanOrEqual(2 * listings.size);
  });
});
