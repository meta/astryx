// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx theme build` keeps a theme's transpiled code in the per-user
 * jiti cache (foundation/fs/jiti-cache.mjs). A second build reads it back and
 * builds the same files; an edited theme is transpiled again and builds as it
 * would with no cache.
 */

import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import {ensureCoreBuilt} from './ensure-core-built.mjs';
import {CLI_ROOT} from '../../../foundation/fs/paths.mjs';

const BIN = path.join(CLI_ROOT, 'clients', 'cli', 'bin', 'astryx.mjs');

beforeAll(() => {
  ensureCoreBuilt();
}, 200_000);

/** @type {string} */
let work;
beforeEach(() => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-theme-jiti-cache-'));
});
afterEach(() => {
  fs.rmSync(work, {recursive: true, force: true});
});

/**
 * Write a TypeScript theme whose background is `color`.
 * @param {string} file
 * @param {string} color
 */
function writeTheme(file, color) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(
    file,
    [
      'const theme: {name: string; tokens: Record<string, string>} = {',
      "  name: 'cached',",
      `  tokens: {'--color-bg': '${color}'},`,
      '};',
      'export default theme;',
      '',
    ].join('\n'),
  );
}

/**
 * Build `theme.ts` in `project` with `cache` as the user cache folder, and
 * return what the run printed and the stylesheet it wrote (named for the
 * theme).
 * @param {string} project
 * @param {string} cache
 */
function build(project, cache) {
  const env = {...process.env};
  for (const key of Object.keys(env)) {
    if (key.startsWith('VITEST') || key === 'NODE_OPTIONS') delete env[key];
  }
  delete env.JITI_FS_CACHE;
  const result = spawnSync(
    process.execPath,
    [BIN, 'theme', 'build', 'theme.ts'],
    {
      cwd: project,
      encoding: 'utf8',
      env: {
        ...env,
        XDG_CACHE_HOME: cache,
        NO_UPDATE_NOTIFIER: '1',
        NODE_DISABLE_COMPILE_CACHE: '1',
      },
    },
  );
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    css: fs.readFileSync(path.join(project, 'cached.css'), 'utf8'),
  };
}

/**
 * The transpiled copies of the theme in a user cache folder, by name, with
 * each one's inode and time.
 * @param {string} cache
 * @returns {Map<string, {ino: number, mtimeMs: number}>}
 */
function themeCopies(cache) {
  const dir = path.join(cache, 'astryx', 'jiti');
  /** @type {Map<string, {ino: number, mtimeMs: number}>} */
  const out = new Map();
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (!name.includes('theme')) continue;
    const {ino, mtimeMs} = fs.statSync(path.join(dir, name));
    out.set(name, {ino, mtimeMs});
  }
  return out;
}

describe.skipIf(process.platform === 'win32')(
  'theme build with the transpile cache',
  () => {
    it('keeps the transpiled theme and reads it back on the next build', () => {
      const project = path.join(work, 'project');
      const cache = path.join(work, 'cache');
      writeTheme(path.join(project, 'theme.ts'), '#ffffff');
      const first = build(project, cache);
      expect(first.status, first.stderr).toBe(0);
      const kept = themeCopies(cache);
      expect(kept.size).toBe(1);
      expect(build(project, cache)).toEqual(first);
      // Read back, not transpiled and written again.
      expect(themeCopies(cache)).toEqual(kept);
    }, 120_000);

    it('transpiles an edited theme again and builds it as with no cache', () => {
      const project = path.join(work, 'project');
      const cache = path.join(work, 'cache');
      const theme = path.join(project, 'theme.ts');
      writeTheme(theme, '#ffffff');
      expect(build(project, cache).status).toBe(0);
      writeTheme(theme, '#123456');
      const edited = build(project, cache);
      expect(edited.status, edited.stderr).toBe(0);
      expect(edited.css).toContain('#123456');
      expect(edited).toEqual(build(project, path.join(work, 'empty-cache')));
      // The edit wrote over the theme's copy: the folder holds one.
      expect(themeCopies(cache).size).toBe(1);
    }, 120_000);

    it('transpiles the theme again, with no error, when its kept copy is gone or cut short', () => {
      const project = path.join(work, 'project');
      const cache = path.join(work, 'cache');
      writeTheme(path.join(project, 'theme.ts'), '#ffffff');
      const first = build(project, cache);
      expect(first.status, first.stderr).toBe(0);
      const dir = path.join(cache, 'astryx', 'jiti');
      const [name] = [...themeCopies(cache).keys()];
      const copy = path.join(dir, name);
      const whole = fs.readFileSync(copy, 'utf8');
      // Removed, as the size limit removes the oldest copies.
      fs.rmSync(copy);
      expect(build(project, cache)).toEqual(first);
      expect(fs.readFileSync(copy, 'utf8')).toBe(whole);
      // Cut short, as a write that did not finish leaves it.
      fs.writeFileSync(copy, whole.slice(0, whole.length / 2));
      expect(build(project, cache)).toEqual(first);
      expect(fs.readFileSync(copy, 'utf8')).toBe(whole);
    }, 120_000);
  },
);
