// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A package.json that appears between packageNameAt's stamp and its
 * read gives its name once, and the name is not kept for the absent stamp.
 */

import {expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const stamps = vi.hoisted(() => ({absentOnce: false}));

vi.mock('./read-record.mjs', async importOriginal => {
  const real = /** @type {any} */ (await importOriginal());
  return {
    ...real,
    fileStamp: (/** @type {string} */ file) => {
      if (!stamps.absentOnce) return real.fileStamp(file);
      stamps.absentOnce = false;
      return '-';
    },
  };
});

const {packageNameAt} = await import('./package-name.mjs');

it('keeps no name read from a file that appeared after its stamp', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-package-name-'));
  try {
    const file = path.join(dir, 'package.json');
    fs.writeFileSync(file, '{"name": "appeared"}');
    stamps.absentOnce = true;
    expect(packageNameAt(file)).toBe('appeared');
    fs.rmSync(file);
    expect(packageNameAt(file)).toBeUndefined();
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});
