// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file jiti-cache.test.mjs
 * @input A per-user cache folder under a temporary XDG_CACHE_HOME
 * @output Where jiti keeps transpiled TypeScript: the user's own 0700 folder,
 *   no disk cache when that folder is open to others or a link, and jiti's
 *   own setting when JITI_FS_CACHE is set
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
});
