// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  findEntry,
  listDir,
  listDirEntries,
  listingCacheActive,
  pathExists,
  withListingCache,
} from './listing-cache.mjs';
import {existsCaseExact} from './paths.mjs';

let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-listing-cache-'));
  fs.writeFileSync(path.join(dir, 'b.txt'), '');
  fs.writeFileSync(path.join(dir, 'a.txt'), '');
});

afterEach(() => {
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
      expect(
        listDirEntries(dir)
          .map(entry => entry.name)
          .sort(),
      ).toEqual(['a.txt', 'b.txt', 'c.txt']);
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
});
