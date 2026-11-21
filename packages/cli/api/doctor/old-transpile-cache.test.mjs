// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file old-transpile-cache.test.mjs
 * @input A temporary per-user cache folder, with and without the single
 *   folder where earlier CLIs left jiti's copies of transpiled code
 * @output Doctor's info row that names that folder where the CLI resolves it
 *   (XDG_CACHE_HOME, macOS's cache folder, Windows' local app data) and the
 *   command that removes it, found by one stat, never a listing
 */

import * as fs from 'node:fs';
import {createRequire, syncBuiltinESMExports} from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {
  oldTranspileCacheDir,
  transpiledCacheDir,
} from '../../foundation/env/user-dirs.mjs';
import {checkOldTranspileCache, removeFolderCommand} from './doctor.mjs';

const require = createRequire(import.meta.url);

/** @type {string} */
let home;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-old-transpile-'));
});

afterEach(() => {
  fs.rmSync(home, {recursive: true, force: true});
});

describe('the old transpile cache row', () => {
  it('is left out when the old folder is not there', () => {
    const options = {platform: 'linux', home, env: {XDG_CACHE_HOME: home}};
    expect(checkOldTranspileCache(options)).toBeNull();
  });

  it('names the old folder under XDG_CACHE_HOME and the command that removes it', () => {
    const cache = path.join(home, 'xdg');
    const options = {platform: 'linux', home, env: {XDG_CACHE_HOME: cache}};
    const old = path.join(cache, 'astryx', 'jiti');
    fs.mkdirSync(old, {recursive: true});
    expect(checkOldTranspileCache(options)).toEqual({
      id: 'old-transpile-cache',
      label: 'Old transpile cache',
      status: 'info',
      message: `An earlier Astryx CLI left transpiled copies in ${old}. This CLI keeps its copies in ${path.join(cache, 'astryx', 'transpiled')} and never reads the old folder.`,
      fix: `To remove it, run: rm -rf ${old}. An earlier CLI that still runs on this computer makes it again.`,
    });
  });

  it("names macOS's cache folder there, whatever XDG_CACHE_HOME says", () => {
    const options = {
      platform: 'darwin',
      home,
      env: {XDG_CACHE_HOME: path.join(home, 'xdg')},
    };
    const old = path.join(home, 'Library', 'Caches', 'astryx', 'jiti');
    expect(oldTranspileCacheDir(options)).toBe(old);
    fs.mkdirSync(old, {recursive: true});
    const row = checkOldTranspileCache(options);
    expect(row?.message).toContain(` ${old}.`);
    expect(row?.message).toContain(
      path.join(home, 'Library', 'Caches', 'astryx', 'transpiled'),
    );
    expect(row?.fix).toContain(`rm -rf ${old}.`);
  });

  it("gives Windows its local app data folder and PowerShell's command", () => {
    // A home folder, as the platform writes it; LOCALAPPDATA left unset.
    const options = {platform: 'win32', home: "C:\\Users\\o'neil", env: {}};
    const old = "C:\\Users\\o'neil\\AppData\\Local\\astryx\\Cache\\jiti";
    expect(oldTranspileCacheDir(options)).toBe(old);
    expect(transpiledCacheDir(options)).toBe(
      "C:\\Users\\o'neil\\AppData\\Local\\astryx\\Cache\\transpiled",
    );
    expect(removeFolderCommand(old, 'win32')).toBe(
      "Remove-Item -Recurse -Force -LiteralPath 'C:\\Users\\o''neil\\AppData\\Local\\astryx\\Cache\\jiti'",
    );
    // PowerShell also ends a quoted string at a typographic quote.
    expect(removeFolderCommand('C:\\Users\\Macy\u2019s\\jiti', 'win32')).toBe(
      "Remove-Item -Recurse -Force -LiteralPath 'C:\\Users\\Macy\u2019\u2019s\\jiti'",
    );
    expect(removeFolderCommand('C:\\Users\\me\\jiti', 'win32')).toBe(
      'Remove-Item -Recurse -Force -LiteralPath C:\\Users\\me\\jiti',
    );
  });

  it('quotes a path for the POSIX shell', () => {
    expect(
      removeFolderCommand("/home/o'neil/.cache/astryx/jiti", 'linux'),
    ).toBe("rm -rf '/home/o'\\''neil/.cache/astryx/jiti'");
  });

  it('removes several folders with one command', () => {
    expect(
      removeFolderCommand(
        [
          '/home/me/.cache/astryx/catalogs',
          '/home/me/.cache/astryx/transpiled',
        ],
        'linux',
      ),
    ).toBe(
      'rm -rf /home/me/.cache/astryx/catalogs /home/me/.cache/astryx/transpiled',
    );
    expect(
      removeFolderCommand(
        ['C:\\Users\\me\\catalogs', "C:\\Users\\o'neil\\transpiled"],
        'win32',
      ),
    ).toBe(
      "Remove-Item -Recurse -Force -LiteralPath C:\\Users\\me\\catalogs, 'C:\\Users\\o''neil\\transpiled'",
    );
  });

  it('finds the old folder with one stat and never lists it', () => {
    const options = {platform: 'linux', home, env: {XDG_CACHE_HOME: home}};
    const old = path.join(home, 'astryx', 'jiti');
    fs.mkdirSync(old, {recursive: true});
    for (let i = 0; i < 50; i++) {
      fs.writeFileSync(path.join(old, `app-${i}.0000000a.mjs`), '');
    }
    const real = require('node:fs');
    /** @type {{name: string, at: string}[]} */
    const calls = [];
    const names = [
      'lstatSync',
      'statSync',
      'readdirSync',
      'opendirSync',
      'existsSync',
    ];
    const originals = names.map(name => [name, real[name]]);
    for (const [name, original] of originals) {
      real[name] = (/** @type {any[]} */ ...args) => {
        if (typeof args[0] === 'string') calls.push({name, at: args[0]});
        return original.apply(real, args);
      };
    }
    syncBuiltinESMExports();
    try {
      expect(checkOldTranspileCache(options)?.id).toBe('old-transpile-cache');
    } finally {
      for (const [name, original] of originals) real[name] = original;
      syncBuiltinESMExports();
    }
    expect(calls.filter(call => call.at.startsWith(old))).toEqual([
      {name: 'lstatSync', at: old},
    ]);
  });
});
