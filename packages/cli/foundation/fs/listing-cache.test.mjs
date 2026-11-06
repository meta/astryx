// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import {createRequire, syncBuiltinESMExports} from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import {performance} from 'node:perf_hooks';
import {discoverHooks} from '../discovery/hook-discovery.mjs';
import {fileStamp, recordReads, unchangedSince} from './read-record.mjs';
import {
  findEntry,
  listDir,
  listDirEntries,
  listingCacheActive,
  oncePerListing,
  pathExists,
  withListingCache,
} from './listing-cache.mjs';
import {existsCaseExact} from './paths.mjs';

let dir;

/** node:fs's module object, whose functions every import of it shares. */
const nodeFs = createRequire(import.meta.url)('node:fs');

/**
 * Runs `fn` and counts the reads of `folder`'s listing it makes.
 * @param {string} folder
 * @param {() => void} fn
 * @returns {number}
 */
function countListings(folder, fn) {
  const original = nodeFs.readdirSync;
  let count = 0;
  nodeFs.readdirSync = function (target, ...rest) {
    if (path.resolve(String(target)) === path.resolve(folder)) count += 1;
    return original.call(this, target, ...rest);
  };
  syncBuiltinESMExports();
  try {
    fn();
  } finally {
    nodeFs.readdirSync = original;
    syncBuiltinESMExports();
  }
  return count;
}

/** How far `pass` has moved the clock the listing cache reads, in ms. */
let passed = 0;

/**
 * Moves the clock the listing cache reads (`performance.now`) on by `ms`.
 * @param {number} ms
 */
function pass(ms) {
  passed += ms;
}

/** How many times `touchLater` has run, so each run sets new times. */
let touches = 0;

/**
 * Sets `folder`'s times after any it had. A change made just after an
 * earlier one can keep the folder's times where they tick coarsely. The
 * moved clock does not move them.
 * @param {string} folder
 */
function touchLater(folder) {
  touches += 1;
  const later = new Date(Date.now() + 5_000 + touches * 1_000);
  fs.utimesSync(folder, later, later);
}

beforeEach(() => {
  passed = 0;
  const now = performance.now.bind(performance);
  vi.spyOn(performance, 'now').mockImplementation(() => now() + passed);
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-listing-cache-'));
  fs.writeFileSync(path.join(dir, 'b.txt'), '');
  fs.writeFileSync(path.join(dir, 'a.txt'), '');
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, {recursive: true, force: true});
});

describe('listing cache', () => {
  it('reads the disk directly outside an operation', () => {
    expect(listDir(dir).sort()).toEqual(['a.txt', 'b.txt']);
    fs.writeFileSync(path.join(dir, 'c.txt'), '');
    expect(listDir(dir).sort()).toEqual(['a.txt', 'b.txt', 'c.txt']);
    expect(pathExists(path.join(dir, 'c.txt'))).toBe(true);
  });

  it('answers from one read for the rest of an operation', async () => {
    await withListingCache(async () => {
      expect(listDir(dir).sort()).toEqual(['a.txt', 'b.txt']);
      expect(pathExists(path.join(dir, 'c.txt'))).toBe(false);
      fs.writeFileSync(path.join(dir, 'c.txt'), '');
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(listDir(dir).sort()).toEqual(['a.txt', 'b.txt']);
      expect(pathExists(path.join(dir, 'c.txt'))).toBe(false);
      // The names and the entries come from the same read.
      expect(
        listDirEntries(dir)
          .map(entry => entry.name)
          .sort(),
      ).toEqual(['a.txt', 'b.txt']);
    });
    // The operation's snapshot does not outlive it.
    expect(listDir(dir).sort()).toEqual(['a.txt', 'b.txt', 'c.txt']);
  });

  it('shares one cache with nested operations', () => {
    withListingCache(() => {
      listDir(dir);
      fs.writeFileSync(path.join(dir, 'c.txt'), '');
      withListingCache(() => {
        expect(listDir(dir).sort()).toEqual(['a.txt', 'b.txt']);
      });
    });
  });

  it('hands every caller its own array', () => {
    withListingCache(() => {
      listDir(dir).reverse().push('mutated');
      expect(listDir(dir)).not.toContain('mutated');
      listDirEntries(dir).length = 0;
      expect(listDirEntries(dir)).toHaveLength(2);
    });
  });

  it('does not remember a failed read', () => {
    const missing = path.join(dir, 'later');
    withListingCache(() => {
      expect(() => listDir(missing)).toThrow();
      fs.mkdirSync(missing);
      expect(listDir(missing)).toEqual([]);
    });
  });

  it('computes a value once per operation, and each time outside one', () => {
    let computed = 0;
    const compute = () => ({count: ++computed});
    withListingCache(() => {
      const first = oncePerListing('key', compute);
      expect(oncePerListing('key', compute)).toBe(first);
      expect(computed).toBe(1);
    });
    oncePerListing('key', compute);
    oncePerListing('key', compute);
    expect(computed).toBe(3);
  });

  it('keeps existsCaseExact exact-case inside an operation', () => {
    fs.mkdirSync(path.join(dir, 'Button'));
    withListingCache(() => {
      expect(existsCaseExact(path.join(dir, 'Button'), dir)).toBe(true);
      expect(existsCaseExact(path.join(dir, 'button'), dir)).toBe(false);
    });
  });

  it('says whether an operation is running', async () => {
    expect(listingCacheActive()).toBe(false);
    await withListingCache(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(listingCacheActive()).toBe(true);
    });
    expect(listingCacheActive()).toBe(false);
  });

  it('finds an entry by its exact name, from the listing inside an operation', () => {
    withListingCache(() => {
      expect(findEntry(dir, 'a.txt')?.isFile()).toBe(true);
      expect(findEntry(dir, 'A.txt')).toBeNull();
      fs.writeFileSync(path.join(dir, 'c.txt'), '');
      // The listing answers, not the disk.
      expect(findEntry(dir, 'c.txt')).toBeNull();
      expect(findEntry(path.join(dir, 'missing'), 'a.txt')).toBeNull();
    });
    expect(findEntry(dir, 'c.txt')?.isFile()).toBe(true);
  });

  it('answers existsCaseExact from the listings inside an operation, as outside', () => {
    fs.mkdirSync(path.join(dir, 'src', 'Button'), {recursive: true});
    fs.writeFileSync(path.join(dir, 'src', 'Button', 'Button.tsx'), '');
    fs.symlinkSync(
      path.join(dir, 'src', 'Button', 'Button.tsx'),
      path.join(dir, 'src', 'Linked.tsx'),
    );
    fs.symlinkSync(
      path.join(dir, 'src', 'Gone.tsx'),
      path.join(dir, 'src', 'Dangling.tsx'),
    );
    const cases = [
      [path.join('src', 'Button', 'Button.tsx'), true],
      [path.join('src', 'button', 'Button.tsx'), false],
      [path.join('src', 'Button', 'button.tsx'), false],
      [path.join('src', 'Linked.tsx'), true],
      [path.join('src', 'Dangling.tsx'), false],
      [path.join('src', 'Button', 'Button.tsx', 'x'), false],
      [path.join('src', 'Missing.tsx'), false],
      // Not plain paths under the root: these take path.relative.
      [`src${path.sep}..${path.sep}src${path.sep}Linked.tsx`, true],
      [`src${path.sep}${path.sep}Linked.tsx`, true],
      [
        `..${path.sep}${path.basename(dir)}${path.sep}src${path.sep}Linked.tsx`,
        true,
      ],
    ];
    const outside = cases.map(([rel]) =>
      existsCaseExact(`${dir}${path.sep}${rel}`, dir),
    );
    const inside = withListingCache(() =>
      cases.map(([rel]) => existsCaseExact(`${dir}${path.sep}${rel}`, dir)),
    );
    expect(outside).toEqual(cases.map(([, exists]) => exists));
    expect(inside).toEqual(outside);
    withListingCache(() => {
      expect(existsCaseExact(dir, dir)).toBe(true);
      expect(existsCaseExact(path.dirname(dir), dir)).toBe(false);
      // A root written with a trailing separator.
      expect(
        existsCaseExact(
          path.join(dir, 'src', 'Linked.tsx'),
          `${dir}${path.sep}`,
        ),
      ).toBe(true);
    });
  });
  it("keeps a folder's listing once its stamp has held for the settle time, until the folder changes", () => {
    const names = () => withListingCache(() => listDir(dir).sort());
    const first = countListings(dir, () =>
      expect(names()).toEqual(['a.txt', 'b.txt']),
    );
    expect(first).toBe(1);
    // The stamp has held for 1 s: the next operation reads the folder again.
    pass(1000);
    expect(countListings(dir, names)).toBe(1);
    // It has held for 2.5 s: this read is kept, and the next one uses it.
    pass(1500);
    expect(countListings(dir, names)).toBe(1);
    const kept = countListings(dir, () =>
      expect(names()).toEqual(['a.txt', 'b.txt']),
    );
    expect(kept).toBe(0);
    fs.writeFileSync(path.join(dir, 'c.txt'), '');
    touchLater(dir);
    const changed = countListings(dir, () =>
      expect(names()).toEqual(['a.txt', 'b.txt', 'c.txt']),
    );
    expect(changed).toBe(1);
    // The new stamp starts its own settle time.
    expect(countListings(dir, names)).toBe(1);
  });

  it('shows each later operation the docs added, removed and renamed in a folder, within the settle time and after it', () => {
    const core = path.join(dir, 'core');
    const hooks = path.join(core, 'src', 'hooks');
    const box = path.join(core, 'src', 'Box');
    fs.mkdirSync(hooks, {recursive: true});
    fs.mkdirSync(box);
    fs.writeFileSync(path.join(hooks, 'useAlpha.doc.mjs'), '');
    fs.writeFileSync(path.join(hooks, 'useBeta.doc.mjs'), '');
    fs.writeFileSync(path.join(box, 'useBox.doc.mjs'), '');
    /** @param {string} name */
    const hookDoc = name => path.join(hooks, `${name}.doc.mjs`);
    const found = () =>
      withListingCache(() => Object.values(discoverHooks(core)).flat().sort());
    expect(found()).toEqual(['useAlpha', 'useBeta', 'useBox']);
    // Within the settle time: an add and a remove, then a rename.
    fs.writeFileSync(hookDoc('useGamma'), '');
    fs.rmSync(hookDoc('useAlpha'));
    expect(found()).toEqual(['useBeta', 'useBox', 'useGamma']);
    fs.renameSync(hookDoc('useBeta'), hookDoc('useDelta'));
    expect(found()).toEqual(['useBox', 'useDelta', 'useGamma']);
    // After it the listings are kept: an add, and a remove in a nested folder.
    pass(2500);
    expect(found()).toEqual(['useBox', 'useDelta', 'useGamma']);
    expect(countListings(hooks, found)).toBe(0);
    fs.writeFileSync(hookDoc('useEpsilon'), '');
    fs.rmSync(path.join(box, 'useBox.doc.mjs'));
    touchLater(hooks);
    touchLater(box);
    expect(found()).toEqual(['useDelta', 'useEpsilon', 'useGamma']);
    // A doc's new content keeps the folder's listing, and the doc is read
    // again.
    pass(2500);
    found();
    fs.writeFileSync(
      hookDoc('useGamma'),
      "export default {\n  category: 'data',\n};\n",
    );
    /** @type {Record<string, string[]>} */
    let groups = {};
    const listings = countListings(hooks, () => {
      groups = withListingCache(() => discoverHooks(core));
    });
    expect(listings).toBe(0);
    expect(groups.Data).toEqual(['useGamma']);
  });

  it('counts a kept listing as read, so a reuse check sees its folder change', () => {
    withListingCache(() => listDir(dir));
    pass(2500);
    withListingCache(() => listDir(dir));
    /** @type {Map<string, string>} */
    const seen = new Map();
    const count = countListings(dir, () =>
      recordReads(seen, () => withListingCache(() => listDir(dir))),
    );
    expect(count).toBe(0);
    expect(seen.get(path.resolve(dir))).toBe(fileStamp(dir));
    expect(unchangedSince(seen)).toBe(true);
    fs.writeFileSync(path.join(dir, 'c.txt'), '');
    touchLater(dir);
    expect(unchangedSince(seen)).toBe(false);
  });
});
