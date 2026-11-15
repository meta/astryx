// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Verifies that a run's folder leaves its place at once. A detached
 * child then removes it and never follows a link. A later run sweeps the
 * trash that a stopped child left behind.
 */

import {afterEach, describe, expect, it} from 'vitest';
import {once} from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {cleanupFixtures, tempDir} from './release-fixtures.mjs';
import {sweepTrash, trashFolder} from './run-folder.mjs';

afterEach(() => {
  cleanupFixtures();
});

/**
 * @param {string} dir
 * @param {number} count
 */
function plant(dir, count) {
  fs.mkdirSync(dir, {recursive: true});
  for (let i = 0; i < count; i += 1) {
    fs.writeFileSync(path.join(dir, `file-${i}`), '');
  }
}

describe('trashFolder', () => {
  it('moves the run folder away before it returns, and its child removes it', async () => {
    const parent = tempDir('run-parent');
    const run = path.join(parent, 'astryx-cli-tarball-run');
    plant(path.join(run, 'astryx-packed-cli-1', 'package'), 50);
    const child = trashFolder(run);
    expect(fs.existsSync(run)).toBe(false);
    if (!child) throw new Error('trashFolder started no child');
    const [code] = await once(child, 'exit');
    expect(code).toBe(0);
    expect(fs.readdirSync(parent)).toEqual([]);
  });

  it('removes a link in the run folder and never what it points to', async () => {
    const parent = tempDir('run-parent');
    const kept = path.join(tempDir('package'), 'assets', 'templates');
    plant(kept, 1);
    const run = path.join(parent, 'astryx-cli-tarball-run');
    fs.mkdirSync(path.join(run, 'assets'), {recursive: true});
    fs.symlinkSync(kept, path.join(run, 'assets', 'templates'), 'junction');
    const child = trashFolder(run);
    if (!child) throw new Error('trashFolder started no child');
    await once(child, 'exit');
    expect(fs.readdirSync(parent)).toEqual([]);
    expect(fs.readdirSync(kept)).toEqual(['file-0']);
  });

  it('starts nothing when the folder is already gone', () => {
    const gone = path.join(tempDir('run-parent'), 'astryx-cli-tarball-gone');
    expect(trashFolder(gone)).toBeNull();
  });
});

describe('sweepTrash', () => {
  it("removes trash that an earlier run left, and keeps a later run's", async () => {
    const parent = tempDir('sweep');
    for (const name of [
      'astryx-cli-tarball-a.trash-1000',
      'astryx-cli-tarball-b.trash-3000',
      'astryx-cli-tarball-c',
      'another-tool.trash-1000',
    ]) {
      plant(path.join(parent, name), 3);
    }
    const children = sweepTrash(parent, 2000);
    await Promise.all(children.map(child => once(child, 'exit')));
    expect(fs.readdirSync(parent).sort()).toEqual([
      'another-tool.trash-1000',
      'astryx-cli-tarball-b.trash-3000',
      'astryx-cli-tarball-c',
    ]);
  });
});
