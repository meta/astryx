// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  listDir,
  listDirEntries,
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
});
