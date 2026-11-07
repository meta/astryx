// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Covers the listing cache on a file system that stores times
 * coarsely. There, a change within one tick of the last leaves the folder's
 * stamp as it was. A later operation still lists the folder as it is.
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {performance} from 'node:perf_hooks';
import {listDir, withListingCache} from './listing-cache.mjs';
import {recordReads, unchangedSince} from './read-record.mjs';

/**
 * The stamp each folder reports, by path, in place of its real one, and work
 * to do once right after the next stamp is taken.
 */
const {stamps, afterStamp} = vi.hoisted(() => ({
  stamps: /** @type {Map<string, string>} */ (new Map()),
  afterStamp: /** @type {{run: (() => void) | null}} */ ({run: null}),
}));

vi.mock('./read-record.mjs', async importOriginal => {
  const actual = /** @type {typeof import('./read-record.mjs')} */ (
    await importOriginal()
  );
  return {
    ...actual,
    /** @param {string} file */
    fileStamp: file => {
      const stamp = stamps.get(file) ?? actual.fileStamp(file);
      const run = afterStamp.run;
      afterStamp.run = null;
      run?.();
      return stamp;
    },
  };
});

/** @type {string} */
let dir;
let passed = 0;

beforeEach(() => {
  passed = 0;
  const now = performance.now.bind(performance);
  vi.spyOn(performance, 'now').mockImplementation(() => now() + passed);
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-listing-coarse-'));
  fs.writeFileSync(path.join(dir, 'a.txt'), '');
  fs.writeFileSync(path.join(dir, 'b.txt'), '');
});

afterEach(() => {
  vi.restoreAllMocks();
  stamps.clear();
  afterStamp.run = null;
  fs.rmSync(dir, {recursive: true, force: true});
});

describe('listing cache with coarse folder times', () => {
  it('lists a change made in the same tick as the last one', () => {
    // Every change in this tick leaves the folder's stamp as it is.
    stamps.set(path.resolve(dir), 'tick 0');
    const names = () => withListingCache(() => listDir(dir).sort());
    expect(names()).toEqual(['a.txt', 'b.txt']);
    fs.writeFileSync(path.join(dir, 'c.txt'), '');
    passed += 1000;
    expect(names()).toEqual(['a.txt', 'b.txt', 'c.txt']);
    fs.rmSync(path.join(dir, 'a.txt'));
    passed += 1500;
    // The stamp has held for 2.5 s: this read is kept, with the remove in it.
    expect(names()).toEqual(['b.txt', 'c.txt']);
    expect(names()).toEqual(['b.txt', 'c.txt']);
    // A change after that falls in a later tick, so the stamp changes.
    fs.writeFileSync(path.join(dir, 'd.txt'), '');
    stamps.set(path.resolve(dir), 'tick 1');
    expect(names()).toEqual(['b.txt', 'c.txt', 'd.txt']);
  });
  it('lets a reuse check see a change made right after the stamp of a kept listing', () => {
    stamps.set(path.resolve(dir), 'tick 0');
    withListingCache(() => listDir(dir));
    passed += 2500;
    withListingCache(() => listDir(dir));
    // The next read reuses the kept listing; the folder changes right after
    // its stamp is taken.
    afterStamp.run = () => {
      fs.writeFileSync(path.join(dir, 'c.txt'), '');
      // The real times may tick coarsely: set them after any they had.
      const later = new Date(Date.now() + 5_000);
      fs.utimesSync(dir, later, later);
    };
    /** @type {Map<string, string>} */
    const seen = new Map();
    const names = recordReads(seen, () =>
      withListingCache(() => listDir(dir).sort()),
    );
    expect(names).toEqual(['a.txt', 'b.txt']);
    expect(unchangedSince(seen)).toBe(false);
  });
});
