// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file jiti-cache.test.mjs
 * @input A per-user cache folder under a temporary XDG_CACHE_HOME
 * @output Where jiti keeps transpiled TypeScript: the user's own 0700 folder,
 *   no disk cache when that folder is open to others or a link, and jiti's
 *   own setting when JITI_FS_CACHE is set; the folder kept within its size
 *   limit, checked again only once a file was made or removed
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const posix = process.platform !== 'win32';

/** @type {string} */
let home;
/** @type {Record<string, string | undefined>} */
let saved;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-jiti-cache-'));
  saved = {
    XDG_CACHE_HOME: process.env.XDG_CACHE_HOME,
    JITI_FS_CACHE: process.env.JITI_FS_CACHE,
  };
  process.env.XDG_CACHE_HOME = home;
  delete process.env.JITI_FS_CACHE;
  vi.resetModules();
});

afterEach(() => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  fs.rmSync(home, {recursive: true, force: true});
});

/** @returns {Promise<typeof import('./jiti-cache.mjs')>} */
const load = () => import('./jiti-cache.mjs');

describe.skipIf(!posix || process.platform === 'darwin')('jiti cache', () => {
  it("makes the user's own 0700 folder on first use and uses it at once", async () => {
    const {jitiCacheOptions, jitiCacheDir} = await load();
    const dir = path.join(home, 'astryx', 'jiti');
    expect(jitiCacheDir()).toBe(dir);
    expect(jitiCacheOptions()).toEqual({fsCache: dir});
    expect(fs.statSync(dir).mode & 0o777).toBe(0o700);
  });

  it('keeps nothing on disk when the folder is open to others', async () => {
    const dir = path.join(home, 'astryx', 'jiti');
    fs.mkdirSync(dir, {recursive: true});
    fs.chmodSync(dir, 0o755);
    const {jitiCacheOptions} = await load();
    expect(jitiCacheOptions()).toEqual({fsCache: false});
  });

  it('keeps nothing on disk when the folder is a link', async () => {
    const real = path.join(home, 'elsewhere');
    fs.mkdirSync(real, {mode: 0o700});
    fs.mkdirSync(path.join(home, 'astryx'), {recursive: true});
    fs.symlinkSync(real, path.join(home, 'astryx', 'jiti'));
    const {jitiCacheOptions} = await load();
    expect(jitiCacheOptions()).toEqual({fsCache: false});
  });

  it('keeps nothing on disk when the folder cannot be made', async () => {
    fs.writeFileSync(path.join(home, 'astryx'), 'not a folder');
    const {jitiCacheOptions} = await load();
    expect(jitiCacheOptions()).toEqual({fsCache: false});
  });

  it('leaves a set JITI_FS_CACHE to jiti', async () => {
    process.env.JITI_FS_CACHE = path.join(home, 'mine');
    const {jitiCacheOptions} = await load();
    expect(jitiCacheOptions()).toEqual({});
    expect(fs.existsSync(path.join(home, 'astryx'))).toBe(false);
  });

  it('holds the transpiled copy of a TypeScript module the CLI loads', async () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-jiti-ts-'));
    try {
      const file = path.join(project, 'manifest.ts');
      fs.writeFileSync(file, 'const n: number = 41;\nexport default n + 1;\n');
      const {importUserModule} = await import('./module-loader.mjs');
      expect((await importUserModule(file)).default).toBe(42);
      const dir = path.join(home, 'astryx', 'jiti');
      expect(fs.readdirSync(dir).some(name => name.includes('manifest'))).toBe(
        true,
      );
    } finally {
      fs.rmSync(project, {recursive: true, force: true});
    }
  });

  /** A day, in seconds. */
  const DAY = 24 * 60 * 60;

  /**
   * Write `name` in `dir` with `bytes` bytes, last changed and read `age`
   * seconds ago.
   * @param {string} dir
   * @param {string} name
   * @param {number} bytes
   * @param {number} age
   */
  const writeAged = (dir, name, bytes, age) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, 'x'.repeat(bytes));
    const time = new Date(Date.now() - age * 1000);
    fs.utimesSync(file, time, time);
  };

  /**
   * Move the folder's time forward, as making or removing a file does. The
   * test sets it, since file-system times can be coarser than the test.
   * @param {string} dir
   */
  const touchFolder = dir => {
    const later = new Date(fs.statSync(dir).mtimeMs + 10_000);
    fs.utimesSync(dir, later, later);
  };

  it('removes the oldest files once the folder holds more than its limit', async () => {
    const {keepWithinLimit} = await load();
    const dir = path.join(home, 'astryx', 'jiti');
    fs.mkdirSync(dir, {recursive: true, mode: 0o700});
    writeAged(dir, 'app-old.0000000a.cjs', 100, 3 * DAY + 40);
    writeAged(dir, 'app-older.0000000b.cjs', 100, 3 * DAY + 50);
    writeAged(dir, 'app-new.0000000c.mjs', 100, 3 * DAY + 20);
    writeAged(dir, 'app-newest.0000000d.cjsx', 100, 3 * DAY + 10);
    keepWithinLimit(dir, 250);
    expect(fs.readdirSync(dir).sort()).toEqual([
      '.checked',
      'app-new.0000000c.mjs',
      'app-newest.0000000d.cjsx',
    ]);
  });

  it('checks again only once a file was made or removed', async () => {
    const {keepWithinLimit} = await load();
    const dir = path.join(home, 'astryx', 'jiti');
    fs.mkdirSync(dir, {recursive: true, mode: 0o700});
    writeAged(dir, 'app-a.0000000a.cjs', 100, 3 * DAY + 30);
    writeAged(dir, 'app-b.0000000b.cjs', 100, 3 * DAY + 20);
    keepWithinLimit(dir, 250);
    // A file written again in place, as jiti writes an edited source's code,
    // leaves the folder's time as it was: nothing is read or removed.
    writeAged(dir, 'app-a.0000000a.cjs', 300, 3 * DAY + 30);
    keepWithinLimit(dir, 250);
    expect(fs.readdirSync(dir).sort()).toEqual([
      '.checked',
      'app-a.0000000a.cjs',
      'app-b.0000000b.cjs',
    ]);
    // A new file moves it, and the next check removes the oldest.
    writeAged(dir, 'app-c.0000000c.cjs', 100, 3 * DAY + 10);
    touchFolder(dir);
    keepWithinLimit(dir, 250);
    expect(fs.readdirSync(dir).sort()).toEqual([
      '.checked',
      'app-b.0000000b.cjs',
      'app-c.0000000c.cjs',
    ]);
  });

  it('removes only the copies jiti wrote: never another file, a link or a folder', async () => {
    const {keepWithinLimit} = await load();
    const dir = path.join(home, 'astryx', 'jiti');
    fs.mkdirSync(dir, {recursive: true, mode: 0o700});
    writeAged(dir, 'notes.txt', 500, 3 * DAY + 90);
    fs.mkdirSync(path.join(dir, 'folder.0000000f.cjs'));
    writeAged(
      path.join(dir, 'folder.0000000f.cjs'),
      'inside.00000001.cjs',
      500,
      90,
    );
    const outside = path.join(home, 'outside.00000002.cjs');
    writeAged(home, 'outside.00000002.cjs', 500, 3 * DAY + 90);
    fs.symlinkSync(outside, path.join(dir, 'link.00000003.cjs'));
    writeAged(dir, 'app-old.0000000a.cjs', 100, 3 * DAY + 60);
    writeAged(dir, 'app-new.0000000b.cjs', 100, 3 * DAY + 30);
    keepWithinLimit(dir, 150);
    expect(fs.readdirSync(dir).sort()).toEqual([
      '.checked',
      'app-new.0000000b.cjs',
      'folder.0000000f.cjs',
      'link.00000003.cjs',
      'notes.txt',
    ]);
    expect(fs.readdirSync(path.join(dir, 'folder.0000000f.cjs'))).toEqual([
      'inside.00000001.cjs',
    ]);
    expect(fs.existsSync(outside)).toBe(true);
  });

  it('names the copy jiti writes for a loaded module as the limit counts it', async () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-jiti-name-'));
    try {
      const file = path.join(project, 'named.ts');
      fs.writeFileSync(file, 'export const n: number = 1;\n');
      // A source in a dot folder, as a Storybook theme is.
      const dotted = path.join(project, '.storybook', 'theme.ts');
      fs.mkdirSync(path.dirname(dotted));
      fs.writeFileSync(dotted, 'export const t: number = 2;\n');
      const {importUserModule} = await import('./module-loader.mjs');
      await importUserModule(file);
      await importUserModule(dotted);
      const {isTranspiledCopy} = await load();
      const copies = fs
        .readdirSync(path.join(home, 'astryx', 'jiti'))
        .filter(name => name !== '.checked');
      expect(copies.some(name => name.includes('-named.'))).toBe(true);
      expect(copies.some(name => name.startsWith('.storybook'))).toBe(true);
      expect(copies.filter(name => !isTranspiledCopy(name))).toEqual([]);
    } finally {
      fs.rmSync(project, {recursive: true, force: true});
    }
  });

  it('keeps a copy written or read in the last day, even over its limit', async () => {
    const {keepWithinLimit} = await load();
    const dir = path.join(home, 'astryx', 'jiti');
    fs.mkdirSync(dir, {recursive: true, mode: 0o700});
    writeAged(dir, 'app-written.0000000a.cjs', 100, 3600);
    writeAged(dir, 'app-read.0000000b.cjs', 100, 3 * DAY);
    // Written days ago, read an hour ago.
    const read = path.join(dir, 'app-read.0000000b.cjs');
    const hourAgo = new Date(Date.now() - 3600 * 1000);
    fs.utimesSync(read, hourAgo, fs.statSync(read).mtime);
    writeAged(dir, 'app-unused.0000000c.cjs', 100, 3 * DAY + 60);
    keepWithinLimit(dir, 50);
    expect(fs.readdirSync(dir).sort()).toEqual([
      '.checked',
      'app-read.0000000b.cjs',
      'app-written.0000000a.cjs',
    ]);
  });

  it('keeps a copy whose read time a once-a-day update left a day behind', async () => {
    const {keepWithinLimit} = await load();
    const dir = path.join(home, 'astryx', 'jiti');
    fs.mkdirSync(dir, {recursive: true, mode: 0o700});
    /**
     * @param {string} name
     * @param {number} readAge seconds since the recorded read
     */
    const readAged = (name, readAge) => {
      writeAged(dir, name, 100, 4 * DAY);
      const file = path.join(dir, name);
      const read = new Date(Date.now() - readAge * 1000);
      fs.utimesSync(file, read, fs.statSync(file).mtime);
    };
    // Read in the last day, with a read time a day older than that read.
    readAged('app-read.0000000a.cjs', 40 * 60 * 60);
    readAged('app-unused.0000000b.cjs', 50 * 60 * 60);
    keepWithinLimit(dir, 50);
    expect(fs.readdirSync(dir).sort()).toEqual([
      '.checked',
      'app-read.0000000a.cjs',
    ]);
  });

  it('never follows a link at its record of the last check', async () => {
    const {keepWithinLimit} = await load();
    const dir = path.join(home, 'astryx', 'jiti');
    fs.mkdirSync(dir, {recursive: true, mode: 0o700});
    const outside = path.join(home, 'outside.txt');
    fs.writeFileSync(outside, 'outside');
    fs.symlinkSync(outside, path.join(dir, '.checked'));
    writeAged(dir, 'app-a.0000000a.cjs', 100, 3 * DAY + 30);
    keepWithinLimit(dir, 50);
    expect(fs.readdirSync(dir)).toEqual(['.checked']);
    expect(fs.lstatSync(path.join(dir, '.checked')).isSymbolicLink()).toBe(
      true,
    );
    expect(fs.readFileSync(outside, 'utf8')).toBe('outside');
    // A link to nothing makes nothing.
    const nowhere = path.join(home, 'nowhere.txt');
    fs.rmSync(path.join(dir, '.checked'));
    fs.symlinkSync(nowhere, path.join(dir, '.checked'));
    writeAged(dir, 'app-b.0000000b.cjs', 100, 3 * DAY + 30);
    keepWithinLimit(dir, 50);
    expect(fs.readdirSync(dir)).toEqual(['.checked']);
    expect(fs.existsSync(nowhere)).toBe(false);
  });

  it('never counts or removes its own record of the last check', async () => {
    const {keepWithinLimit} = await load();
    const dir = path.join(home, 'astryx', 'jiti');
    fs.mkdirSync(dir, {recursive: true, mode: 0o700});
    writeAged(dir, '.checked', 1000, 3 * DAY + 60);
    writeAged(dir, 'app-a.0000000a.cjs', 100, 3 * DAY + 30);
    keepWithinLimit(dir, 150);
    expect(fs.readdirSync(dir).sort()).toEqual([
      '.checked',
      'app-a.0000000a.cjs',
    ]);
  });
});
