// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file packageNameAt keeps a package.json's name while the file is
 * unchanged, and a kept name counts as a read of the file.
 */

import {expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {packageNameAt} from './package-name.mjs';
import {recordReads} from './read-record.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-package-name-'));
const file = path.join(dir, 'package.json');
const absent = path.join(dir, 'none', 'package.json');

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

it('counts a kept name as a read of the file, absent or present', () => {
  const read = () => [packageNameAt(file), packageNameAt(absent)];
  const fresh = new Map();
  const kept = new Map();
  recordReads(fresh, read);
  recordReads(kept, read);
  expect([...kept]).toEqual([...fresh]);
  expect([...fresh.keys()]).toEqual(expect.arrayContaining([file]));
});
