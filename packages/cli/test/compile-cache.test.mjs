// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * The CLI turns on Node's compile cache in the user's own folder in the
 * system temp folder (node-compile-cache-<uid>), from the run that makes that folder, and
 * only while no one else can reach it. It never changes what a command prints
 * or whether it succeeds: not when the cache is off, cold, warm, refused, or
 * cannot be written. Systems without user ids (Windows) keep it off.
 */

import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {CLI_ROOT} from '../foundation/fs/paths.mjs';

/** The user's own cache folder's name in the temp folder. */
const CACHE_NAME = `node-compile-cache-${process.getuid?.()}`;
const BIN = path.join(CLI_ROOT, 'clients', 'cli', 'bin', 'astryx.mjs');
const SANDBOX = path.resolve(CLI_ROOT, '..', '..', 'apps', 'sandbox');

/** @type {string} */
let work;

beforeAll(() => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'compile-cache-'));
});

afterAll(() => {
  if (work) fs.rmSync(work, {recursive: true, force: true});
});

/**
 * Run `component Button --json` with `tmp` as the system temp folder.
 * @param {string} tmp
 * @param {Record<string, string>} [env]
 */
function run(tmp, env = {}) {
  const base = {...process.env};
  delete base.NODE_COMPILE_CACHE;
  delete base.NODE_DISABLE_COMPILE_CACHE;
  const result = spawnSync(
    process.execPath,
    [BIN, 'component', 'Button', '--json'],
    {
      cwd: SANDBOX,
      encoding: 'utf8',
      env: {
        ...base,
        TMPDIR: tmp,
        TMP: tmp,
        TEMP: tmp,
        NO_UPDATE_NOTIFIER: '1',
        ...env,
      },
    },
  );
  return {status: result.status, stdout: result.stdout, stderr: result.stderr};
}

describe.skipIf(process.platform === 'win32')("Node's compile cache", () => {
  it('is written on the first run, which makes its folder, and changes no output', () => {
    const tmp = path.join(work, 'first');
    fs.mkdirSync(tmp);
    const off = run(path.join(work, 'off-first'), {
      NODE_DISABLE_COMPILE_CACHE: '1',
    });
    expect(run(tmp)).toEqual(off);
    expect(fs.readdirSync(tmp)).toEqual([CACHE_NAME]);
    expect(fs.statSync(path.join(tmp, CACHE_NAME)).mode & 0o777).toBe(0o700);
    expect(fs.readdirSync(path.join(tmp, CACHE_NAME)).length).toBeGreaterThan(
      0,
    );
    // The second run reads what the first wrote.
    const debug = run(tmp, {NODE_DEBUG_NATIVE: 'COMPILE_CACHE'});
    expect(debug.stderr).toMatch(/was accepted/);
    expect(debug.stdout).toEqual(off.stdout);
  });

  it('is written once its folder exists, then reused, and changes no output', () => {
    const tmp = path.join(work, 'warm');
    fs.mkdirSync(path.join(tmp, CACHE_NAME), {recursive: true});
    fs.chmodSync(path.join(tmp, CACHE_NAME), 0o700);
    const off = run(path.join(work, 'off-warm'), {
      NODE_DISABLE_COMPILE_CACHE: '1',
    });
    const cold = run(tmp);
    const written = fs.readdirSync(path.join(tmp, CACHE_NAME));
    expect(written.length).toBeGreaterThan(0);
    const warm = run(tmp);
    // Node read the cache back: it reports each entry it accepted.
    const debug = run(tmp, {NODE_DEBUG_NATIVE: 'COMPILE_CACHE'});
    expect(debug.stderr).toMatch(/was accepted/);
    expect(off.status).toBe(0);
    for (const result of [cold, warm]) expect(result).toEqual(off);
  });

  it('stays off, making no folder, where the system has no user ids', () => {
    const tmp = path.join(work, 'no-uid');
    fs.mkdirSync(tmp);
    // As on Windows: no process.getuid, so a folder's owner cannot be checked.
    const preload = path.join(work, 'no-uid.cjs');
    fs.writeFileSync(preload, 'delete process.getuid;\n');
    const off = run(path.join(work, 'off-no-uid'), {
      NODE_DISABLE_COMPILE_CACHE: '1',
    });
    const noUid = run(tmp, {NODE_OPTIONS: `--require ${preload}`});
    expect(noUid).toEqual(off);
    expect(fs.readdirSync(tmp)).toEqual([]);
  });

  it('is off with NODE_DISABLE_COMPILE_CACHE, which makes no folder either', () => {
    const tmp = path.join(work, 'disabled');
    fs.mkdirSync(tmp);
    expect(run(tmp, {NODE_DISABLE_COMPILE_CACHE: '1'}).status).toBe(0);
    expect(fs.readdirSync(tmp)).toEqual([]);
  });

  it('refuses a folder others can reach, a link, or one owned by someone else', () => {
    const off = run(path.join(work, 'off-shared'), {
      NODE_DISABLE_COMPILE_CACHE: '1',
    });
    // Open to the group and others.
    const open = path.join(work, 'open');
    fs.mkdirSync(path.join(open, CACHE_NAME), {recursive: true});
    fs.chmodSync(path.join(open, CACHE_NAME), 0o777);
    expect(run(open)).toEqual(off);
    expect(fs.readdirSync(path.join(open, CACHE_NAME))).toEqual([]);
    // A link to a folder elsewhere.
    const linked = path.join(work, 'linked');
    const target = path.join(work, 'link-target');
    fs.mkdirSync(linked);
    fs.mkdirSync(target, {mode: 0o700});
    fs.symlinkSync(target, path.join(linked, CACHE_NAME), 'dir');
    expect(run(linked)).toEqual(off);
    expect(fs.readdirSync(target)).toEqual([]);
    // Owned by another user: only root can make one, so the check is shown
    // by the process's own uid differing from a folder made for it.
    if (process.getuid?.() === 0) {
      const foreign = path.join(work, 'foreign');
      fs.mkdirSync(path.join(foreign, CACHE_NAME), {
        recursive: true,
        mode: 0o700,
      });
      fs.chownSync(path.join(foreign, CACHE_NAME), 12345, 12345);
      expect(run(foreign)).toEqual(off);
      expect(fs.readdirSync(path.join(foreign, CACHE_NAME))).toEqual([]);
    }
  });

  it('is skipped silently when its folder cannot be made or used', () => {
    const off = run(path.join(work, 'off-broken'), {
      NODE_DISABLE_COMPILE_CACHE: '1',
    });
    // A temp "folder" that is a file: no cache folder can be made in it.
    const notADir = path.join(work, 'not-a-folder');
    fs.writeFileSync(notADir, '');
    expect(run(notADir)).toEqual(off);
    // A cache "folder" that is a file.
    const fileCache = path.join(work, 'file-cache');
    fs.mkdirSync(fileCache);
    fs.writeFileSync(path.join(fileCache, CACHE_NAME), '');
    expect(run(fileCache)).toEqual(off);
    // A cache folder nothing can be written to.
    const readOnly = path.join(work, 'read-only');
    fs.mkdirSync(path.join(readOnly, CACHE_NAME), {recursive: true});
    fs.chmodSync(path.join(readOnly, CACHE_NAME), 0o500);
    try {
      expect(run(readOnly)).toEqual(off);
    } finally {
      fs.chmodSync(path.join(readOnly, CACHE_NAME), 0o700);
    }
  });
});
