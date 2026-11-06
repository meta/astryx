// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * `theme eject` writes a theme as one transaction: when a later file fails to
 * publish, every file it already replaced gets its previous bytes back and
 * every file it created is removed. Publishing is forced to fail by wrapping
 * the two calls that publish a staged file: `linkSync` for a new file and
 * `renameSync` for a replacement.
 *
 * Separate file because vi.mock is hoisted and affects the whole module.
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';

const failures = vi.hoisted(() => ({
  /** Fail the Nth staged-file publish (1-based); 0 disables. */
  publish: 0,
  /** Also fail every rollback restore. */
  restore: false,
  count: 0,
}));

vi.mock('node:fs', async importOriginal => {
  const actual = /** @type {typeof import('node:fs')} */ (
    await importOriginal()
  );
  /** @param {string} source */
  const isStaged = source => path.basename(String(source)).includes('.tmp');
  /** @param {string} source */
  const isRestore = source =>
    path.basename(String(source)).includes('.restore-');
  /** @param {string} source @param {string} op */
  const maybeFail = (source, op) => {
    if (isStaged(source) && failures.publish > 0) {
      failures.count++;
      if (failures.count === failures.publish) {
        throw Object.assign(new Error(`EIO: forced ${op} failure`), {
          code: 'EIO',
        });
      }
    }
    if (isRestore(source) && failures.restore) {
      throw Object.assign(new Error(`EIO: forced restore failure`), {
        code: 'EIO',
      });
    }
  };
  return {
    ...actual,
    linkSync: vi.fn((source, destination) => {
      maybeFail(source, 'link');
      return actual.linkSync(source, destination);
    }),
    renameSync: vi.fn((source, destination) => {
      maybeFail(source, 'rename');
      return actual.renameSync(source, destination);
    }),
  };
});

const fs = await import('node:fs');
const {themeEject} = await import('./eject.mjs');
const {listThemes} = await import('../_adapter.mjs');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-themeeject-rollback-'));
  failures.publish = 0;
  failures.restore = false;
  failures.count = 0;
});

afterEach(() => {
  failures.publish = 0;
  failures.restore = false;
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

function stoneFiles() {
  const theme = listThemes().find(entry => entry.slug === 'stone');
  if (!theme) throw new Error('missing bundled theme stone');
  expect(theme.files.length).toBeGreaterThanOrEqual(2);
  return theme.files.map(name =>
    path.join(tmpDir, 'src', 'themes', 'stone', name),
  );
}

/** Entries staging or rollback left behind in the theme directory. */
function strays() {
  const dir = path.join(tmpDir, 'src', 'themes', 'stone');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, {recursive: true})
    .map(String)
    .filter(name => name.includes('.tmp') || name.includes('.restore-'));
}

describe('themeEject rolls back a partial write', () => {
  it('removes every created file when the second publish fails', async () => {
    const files = stoneFiles();
    failures.publish = 2;

    await expect(themeEject('stone', {cwd: tmpDir})).rejects.toMatchObject({
      code: 'ERR_WRITE_FAILED',
    });

    for (const file of files) expect(fs.existsSync(file)).toBe(false);
    expect(strays()).toEqual([]);
  });

  it('restores every replaced byte when the second publish fails', async () => {
    const files = stoneFiles();
    fs.mkdirSync(path.dirname(files[0]), {recursive: true});
    const before = Buffer.from([0x00, 0xff, 0x0a, 0x62, 0x65, 0x66]);
    fs.writeFileSync(files[0], before);
    failures.publish = 2;

    await expect(
      themeEject('stone', {cwd: tmpDir, overwrite: true}),
    ).rejects.toMatchObject({code: 'ERR_WRITE_FAILED'});

    expect(fs.readFileSync(files[0]).equals(before)).toBe(true);
    for (const file of files.slice(1)) expect(fs.existsSync(file)).toBe(false);
    expect(strays()).toEqual([]);
  });

  it('names a file it could not restore', async () => {
    const files = stoneFiles();
    fs.mkdirSync(path.dirname(files[0]), {recursive: true});
    fs.writeFileSync(files[0], 'before\n');
    failures.publish = 2;
    failures.restore = true;

    let error;
    try {
      await themeEject('stone', {cwd: tmpDir, overwrite: true});
    } catch (caught) {
      error = caught;
    }

    expect(error?.code).toBe('ERR_WRITE_FAILED');
    expect(error?.message).toContain('Could not restore');
    expect(error?.message).toContain(files[0]);
  });

  it('writes every file when nothing fails', async () => {
    const files = stoneFiles();

    const result = await themeEject('stone', {cwd: tmpDir});

    expect(result.type).toBe('theme.eject');
    for (const file of files) expect(fs.existsSync(file)).toBe(true);
    expect(strays()).toEqual([]);
  });
});
