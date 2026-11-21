// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file packageNameAt keeps a package.json's name while the file is
 * unchanged, and a kept name counts as a read of the file.
 */

import {afterAll, expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {packageNameAt} from './package-name.mjs';
import {recordReads} from './read-record.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-package-name-'));
const file = path.join(dir, 'package.json');
const absent = path.join(dir, 'none', 'package.json');

afterAll(() => fs.rmSync(dir, {recursive: true, force: true}));

it('reads a name once while the file is unchanged, again after a change', () => {
  fs.writeFileSync(file, '{"name": "first"}');
  const parse = vi.spyOn(JSON, 'parse');
  expect([packageNameAt(file), packageNameAt(file)]).toEqual([
    'first',
    'first',
  ]);
  expect(parse).toHaveBeenCalledTimes(1);
  parse.mockRestore();
  fs.writeFileSync(file, '{"name": "second", "private": true}');
  expect(packageNameAt(file)).toBe('second');
  expect(packageNameAt(absent)).toBeUndefined();
});

it('records a kept name as a fresh read records it, present or absent', () => {
  const other = path.join(dir, 'other', 'package.json');
  const gone = path.join(dir, 'gone', 'package.json');
  fs.mkdirSync(path.dirname(other));
  fs.writeFileSync(other, '{"name": "other"}');
  const read = () => [packageNameAt(other), packageNameAt(gone)];
  const fresh = new Map();
  const kept = new Map();
  expect(recordReads(fresh, read)).toEqual(['other', undefined]);
  expect(recordReads(kept, read)).toEqual(['other', undefined]);
  expect([...fresh.keys()]).toEqual([other, gone]);
  expect(fresh.get(gone)).toBe('-');
  expect([...kept]).toEqual([...fresh]);
});
