// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A node-project run gives its tests a home folder of its own: no test,
 * and no process a test starts, reads the developer's real home folder.
 */

import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {userCacheDir, userConfigDir} from '../foundation/env/user-dirs.mjs';
import {tempFolderOf} from '../foundation/fs/path-safety.mjs';
import {
  TEST_HOME_ENV,
  changedSince,
  folderState,
  foldersOutside,
  gitGlobalConfig,
  moveUserHome,
  playwrightBrowsersFolder,
} from './test-home.mjs';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the run home folder', () => {
  it('holds every per-user folder setting it moves', () => {
    const home = path.join(os.tmpdir(), 'made-up-home');
    const tmp = path.join(os.tmpdir(), 'made-up-tmp');
    /** @type {Record<string, string | undefined>} */
    const env = {
      HOME: '/somewhere/else',
      USERPROFILE: '/somewhere/else',
      XDG_CACHE_HOME: '/somewhere/cache',
    };
    moveUserHome(home, tmp, env);
    expect(env[TEST_HOME_ENV]).toBe(home);
    expect(env.TMPDIR).toBe(tmp);
    expect(env.TEMP).toBe(tmp);
    expect(env.TMP).toBe(tmp);
    // Playwright keeps reading the browsers from where they were installed.
    expect(env.PLAYWRIGHT_BROWSERS_PATH).toBe(
      process.platform === 'win32' || process.platform === 'darwin'
        ? playwrightBrowsersFolder({}, process.platform, '/somewhere/else')
        : path.join('/somewhere/cache', 'ms-playwright'),
    );
    for (const key of [
      'HOME',
      'USERPROFILE',
      'XDG_CONFIG_HOME',
      'XDG_CACHE_HOME',
      'XDG_DATA_HOME',
      'XDG_STATE_HOME',
      'APPDATA',
      'LOCALAPPDATA',
      'npm_config_cache',
    ]) {
      const rel = path.relative(home, String(env[key]));
      expect(rel.startsWith('..') || path.isAbsolute(rel)).toBe(false);
    }
  });

  it('sits beside the temp folder, which stays a temp folder', () => {
    expect(tempFolderOf(path.join(os.tmpdir(), 'a'))).not.toBeNull();
  });

  it('leaves Playwright its browsers outside the run home folder', () => {
    const browsers = String(process.env.PLAYWRIGHT_BROWSERS_PATH);
    expect(process.env.PLAYWRIGHT_BROWSERS_PATH).toBeTruthy();
    const rel = path.relative(String(process.env[TEST_HOME_ENV]), browsers);
    expect(rel.startsWith('..') || path.isAbsolute(rel)).toBe(true);
  });

  it('finds Playwright browsers where each platform keeps them', () => {
    expect(
      playwrightBrowsersFolder({XDG_CACHE_HOME: '/c'}, 'linux', '/h'),
    ).toBe(path.join('/c', 'ms-playwright'));
    expect(playwrightBrowsersFolder({}, 'linux', '/h')).toBe(
      path.join('/h', '.cache', 'ms-playwright'),
    );
    expect(playwrightBrowsersFolder({}, 'darwin', '/h')).toBe(
      path.join('/h', 'Library', 'Caches', 'ms-playwright'),
    );
    expect(
      playwrightBrowsersFolder({LOCALAPPDATA: 'C:\\L'}, 'win32', 'C:\\h'),
    ).toBe(path.win32.join('C:\\L', 'ms-playwright'));
    expect(
      playwrightBrowsersFolder({PLAYWRIGHT_BROWSERS_PATH: '/p'}, 'linux', '/h'),
    ).toBe('/p');
  });

  it('is where this worker reads its home, cache and configuration', () => {
    const home = String(process.env[TEST_HOME_ENV]);
    expect(process.env[TEST_HOME_ENV]).toBeTruthy();
    expect(foldersOutside(home)).toEqual([]);
    for (const folder of [os.homedir(), userCacheDir(), userConfigDir()]) {
      expect(path.relative(home, folder).startsWith('..')).toBe(false);
    }
  });

  it('is the home of a process a test starts', () => {
    const child = execFileSync(
      process.execPath,
      ['-p', "require('node:os').homedir()"],
      {encoding: 'utf8'},
    ).trim();
    expect(child).toBe(os.homedir());
    expect(foldersOutside(String(process.env[TEST_HOME_ENV]))).toEqual([]);
  });

  it('names a home folder outside it', () => {
    const elsewhere = path.join(os.tmpdir(), 'made-up-other-home');
    vi.stubEnv('HOME', elsewhere);
    vi.stubEnv('USERPROFILE', elsewhere);
    expect(foldersOutside(String(process.env[TEST_HOME_ENV]))).toContain(
      os.homedir(),
    );
  });
});

describe("the developer's git configuration", () => {
  it('is read in place: its own setting, else ~/.gitconfig, else the XDG file', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'made-up-git-home-'));
    try {
      expect(gitGlobalConfig({GIT_CONFIG_GLOBAL: '/g'}, home)).toBe('/g');
      expect(gitGlobalConfig({}, home)).toBeNull();
      const xdg = path.join(home, '.config', 'git', 'config');
      fs.mkdirSync(path.dirname(xdg), {recursive: true});
      fs.writeFileSync(xdg, '');
      expect(gitGlobalConfig({}, home)).toBe(xdg);
      fs.writeFileSync(path.join(home, '.gitconfig'), '');
      expect(gitGlobalConfig({}, home)).toBe(path.join(home, '.gitconfig'));
    } finally {
      fs.rmSync(home, {recursive: true, force: true});
    }
  });
});

describe('the real per-user folders', () => {
  it('shows a file a test adds, changes or removes there, and a folder it creates', () => {
    const real = fs.mkdtempSync(path.join(os.tmpdir(), 'made-up-real-'));
    try {
      const cache = path.join(real, 'cache');
      const config = path.join(real, 'config');
      fs.mkdirSync(cache);
      fs.writeFileSync(path.join(cache, 'kept.json'), '{}');
      fs.writeFileSync(path.join(cache, 'gone.json'), '{}');
      const before = folderState([cache, config]);
      expect(changedSince(before, folderState([cache, config]))).toEqual([]);
      fs.writeFileSync(path.join(cache, 'kept.json'), '{"a": 1}');
      fs.rmSync(path.join(cache, 'gone.json'));
      fs.mkdirSync(config);
      fs.writeFileSync(path.join(config, 'new.json'), '{}');
      expect(changedSince(before, folderState([cache, config]))).toEqual(
        expect.arrayContaining([
          path.join(cache, 'kept.json'),
          path.join(cache, 'gone.json'),
          config,
          path.join(config, 'new.json'),
        ]),
      );
    } finally {
      fs.rmSync(real, {recursive: true, force: true});
    }
  });
});
