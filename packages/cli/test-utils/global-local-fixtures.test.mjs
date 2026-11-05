// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Verifies that placed CLI copies are reused only when unchanged: a
 * test's copy goes back to the pool and the next placement moves it. A copy a
 * test changed, or one a running step may still use, is never reused. A write
 * into a file every copy shares is reported, and the next copy comes from a
 * fresh unpack.
 */

import {afterAll, afterEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  CLI_DIR,
  packedCli,
  placeCli,
  recyclePlacedCopies,
} from './global-local-fixtures.mjs';
import {cleanupFixtures, tempDir} from './release-fixtures.mjs';

afterEach(() => {
  try {
    recyclePlacedCopies();
  } finally {
    cleanupFixtures();
  }
});
afterAll(() => {
  fs.rmSync(path.dirname(packedCli()), {recursive: true, force: true});
});

/**
 * The inode of a placed copy's package.json, which each new copy writes.
 * @param {string} dir
 */
function manifestInode(dir) {
  return fs.statSync(path.join(dir, 'package.json')).ino;
}

describe('placed CLI copies', () => {
  it('moves a copy a test gave back into the next placement of its label', () => {
    const first = placeCli(path.join(tempDir('place'), 'cli'), '9.0.0');
    const inode = manifestInode(first.dir);
    recyclePlacedCopies();
    const second = placeCli(path.join(tempDir('place'), 'cli'), '9.0.0');
    expect(manifestInode(second.dir)).toBe(inode);
    const other = placeCli(path.join(tempDir('place'), 'cli'), '9.0.1');
    expect(manifestInode(other.dir)).not.toBe(inode);
  });

  it('never reuses a copy while a step may still use it', () => {
    const first = placeCli(path.join(tempDir('place'), 'cli'), '9.0.2');
    const inode = manifestInode(first.dir);
    recyclePlacedCopies({keep: false});
    const second = placeCli(path.join(tempDir('place'), 'cli'), '9.0.2');
    expect(manifestInode(second.dir)).not.toBe(inode);
  });

  it('never reuses a copy whose folder mode a test changed', () => {
    const first = placeCli(path.join(tempDir('place'), 'cli'), '9.0.3');
    const inode = manifestInode(first.dir);
    fs.chmodSync(path.join(first.dir, 'clients'), 0o555);
    recyclePlacedCopies();
    fs.chmodSync(path.join(first.dir, 'clients'), 0o755);
    const second = placeCli(path.join(tempDir('place'), 'cli'), '9.0.3');
    expect(manifestInode(second.dir)).not.toBe(inode);
  });

  it('never reuses a copy a test changed', () => {
    const first = placeCli(path.join(tempDir('place'), 'cli'), '9.0.0');
    fs.rmSync(first.bin);
    recyclePlacedCopies();
    const second = placeCli(path.join(tempDir('place'), 'cli'), '9.0.0');
    expect(fs.existsSync(second.bin)).toBe(true);
  });

  it('reports a write into a shared file, and places the next copy from a fresh unpack', () => {
    const first = placeCli(path.join(tempDir('place'), 'cli'), '9.0.0');
    const rel = path.join('foundation', 'fs', 'paths.mjs');
    // A write in place, with no unlink first, changes the packed file too.
    fs.appendFileSync(path.join(first.dir, rel), '\n// changed\n');
    expect(() => recyclePlacedCopies()).toThrow(/foundation\/fs\/paths\.mjs/);
    const second = placeCli(path.join(tempDir('place'), 'cli'), '9.0.0');
    expect(fs.readFileSync(path.join(second.dir, rel), 'utf8')).toBe(
      fs.readFileSync(path.join(CLI_DIR, rel), 'utf8'),
    );
  });
});
