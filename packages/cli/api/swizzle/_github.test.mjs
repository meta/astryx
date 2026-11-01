// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Unit tests for `checkGhCli()` — the only export of _github.mjs.
 *
 * `checkGhCli` finds an executable `gh` on PATH without running it, so a
 * swizzle never waits on a process start or on GitHub. These tests use
 * temporary PATH directories, and mock `node:child_process` to prove it never
 * spawns anything.
 */

import {describe, it, expect, vi, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {execFileSync, spawn, spawnSync} from 'node:child_process';
import {checkGhCli} from './_github.mjs';

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal();
  return {...actual, statSync: vi.fn(actual.statSync)};
});

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
  spawn: vi.fn(),
  spawnSync: vi.fn(),
}));

/** @type {string[]} */
const dirs = [];
afterEach(() => {
  vi.clearAllMocks();
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

/** A temporary directory, holding `files` with their modes. */
function dirWith(/** @type {Record<string, number>} */ files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-gh-path-'));
  dirs.push(dir);
  for (const [name, mode] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), '');
    fs.chmodSync(path.join(dir, name), mode);
  }
  return dir;
}

describe('checkGhCli', () => {
  it('finds an executable gh on PATH, without running it', () => {
    const empty = dirWith({});
    const tools = dirWith({gh: 0o755});
    const PATH = [empty, tools].join(path.delimiter);
    expect(checkGhCli({PATH}, 'linux')).toBe(true);
    expect(execFileSync).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('does not count a gh that cannot be executed, or a directory named gh', () => {
    const plain = dirWith({gh: 0o644});
    const folder = dirWith({});
    fs.mkdirSync(path.join(folder, 'gh'));
    expect(
      checkGhCli({PATH: [plain, folder].join(path.delimiter)}, 'linux'),
    ).toBe(false);
  });

  it('is false with no gh on PATH, or no PATH', () => {
    expect(checkGhCli({PATH: dirWith({git: 0o755})}, 'linux')).toBe(false);
    expect(checkGhCli({}, 'linux')).toBe(false);
  });

  it('reads a PATH entry that does not exist, is a file, or cannot be searched as holding no gh', () => {
    const missing = path.join(dirWith({}), 'missing');
    const file = path.join(dirWith({tool: 0o644}), 'tool');
    const locked = dirWith({gh: 0o755});
    fs.chmodSync(locked, 0o000);
    try {
      expect(
        checkGhCli(
          {PATH: [missing, file, locked].join(path.delimiter)},
          'linux',
        ),
      ).toBe(process.getuid?.() === 0);
    } finally {
      fs.chmodSync(locked, 0o755);
    }
  });

  it('reads a gh symlink loop, or a PATH entry too long to resolve, as no gh there', () => {
    const looped = dirWith({});
    fs.symlinkSync('gh', path.join(looped, 'gh'));
    const tooLong = path.join(dirWith({}), 'x'.repeat(300));
    expect(
      checkGhCli({PATH: [looped, tooLong].join(path.delimiter)}, 'linux'),
    ).toBe(false);
  });

  it('finds a working gh after a PATH entry on a stale or disconnected mount', () => {
    const stale = dirWith({});
    const tools = dirWith({gh: 0o755});
    vi.mocked(fs.statSync).mockImplementationOnce(() => {
      throw Object.assign(new Error('ESTALE: stale file handle, stat'), {
        code: 'ESTALE',
      });
    });
    expect(
      checkGhCli({PATH: [stale, tools].join(path.delimiter)}, 'linux'),
    ).toBe(true);
  });

  it('throws an error that is not the system answering about a candidate', () => {
    const tools = dirWith({});
    vi.mocked(fs.statSync).mockImplementationOnce(() => {
      throw new TypeError('not a path');
    });
    expect(() => checkGhCli({PATH: tools}, 'linux')).toThrow(TypeError);
  });

  it('on Windows, finds gh with a PATHEXT extension', () => {
    const tools = dirWith({'gh.exe': 0o644});
    expect(checkGhCli({PATH: tools, PATHEXT: '.COM;.EXE'}, 'win32')).toBe(true);
    expect(checkGhCli({PATH: tools, PATHEXT: '.CMD'}, 'win32')).toBe(false);
  });
});
