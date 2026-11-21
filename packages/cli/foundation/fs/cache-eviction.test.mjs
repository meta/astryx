// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file cache-eviction.test.mjs
 * @input A temporary folder of files with set sizes and times
 * @output evictOldest deletes the counted files used longest ago until the
 *   folder holds at most its limit, keeps the file it is told to keep and
 *   files used since a time, and counts only regular files it is told to
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {evictOldest} from './cache-eviction.mjs';

/** @type {string} */
let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-cache-eviction-'));
});

afterEach(() => {
  fs.rmSync(dir, {recursive: true, force: true});
});

/**
 * Write `bytes` bytes at `name` in the folder, last written `age` seconds ago.
 * @param {string} name
 * @param {number} bytes
 * @param {number} age
 */
const writeAged = (name, bytes, age) => {
  const file = path.join(dir, name);
  fs.writeFileSync(file, 'x'.repeat(bytes));
  const time = new Date(Date.now() - age * 1000);
  fs.utimesSync(file, time, time);
  return file;
};

const counted = (/** @type {string} */ name) => name.endsWith('.c');

describe('evictOldest', () => {
  it('deletes the files used longest ago until the folder holds at most its limit', () => {
    writeAged('a.c', 100, 400);
    writeAged('b.c', 100, 300);
    writeAged('c.c', 100, 200);
    const d = writeAged('d.c', 100, 100);
    const kept = evictOldest(dir, counted, {limit: 250});
    expect(fs.readdirSync(dir).sort()).toEqual(['c.c', 'd.c']);
    expect(kept).toBeLessThan(fs.statSync(d).mtimeMs);
  });

  it('never deletes the file it is told to keep, though that file counts', () => {
    const keep = writeAged('a.c', 100, 400);
    writeAged('b.c', 100, 300);
    writeAged('c.c', 100, 200);
    writeAged('d.c', 100, 100);
    expect(evictOldest(dir, counted, {limit: 250, keep})).toBe(
      fs.statSync(keep).mtimeMs,
    );
    expect(fs.readdirSync(dir).sort()).toEqual(['a.c', 'd.c']);
  });

  it('keeps files used since a time, even past the limit', () => {
    writeAged('a.c', 100, 400);
    writeAged('b.c', 100, 10);
    writeAged('c.c', 100, 5);
    evictOldest(dir, counted, {limit: 50, keepUsedSince: Date.now() - 60_000});
    expect(fs.readdirSync(dir).sort()).toEqual(['b.c', 'c.c']);
  });

  it('counts only regular files it is told to count', () => {
    writeAged('a.c', 100, 400);
    writeAged('notes.txt', 1000, 900);
    fs.mkdirSync(path.join(dir, 'folder.c'));
    fs.symlinkSync(path.join(dir, 'notes.txt'), path.join(dir, 'link.c'));
    writeAged('b.c', 100, 100);
    evictOldest(dir, counted, {limit: 150});
    expect(fs.readdirSync(dir).sort()).toEqual([
      'b.c',
      'folder.c',
      'link.c',
      'notes.txt',
    ]);
  });
});
