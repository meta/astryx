// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file hunt59: the app copy is exactly what `theme build` of its source
 * writes (so the stable check and doctor read it as current), a stable
 * rebuild of it leaves it the editor's, and a change that fails after its
 * build never leaves its copy behind.
 *
 * @position api/theme-edit — tests
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {spawnSync} from 'node:child_process';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

// A settings write that fails, on request: the failure after the build.
vi.mock('./_palette.mjs', async importOriginal => {
  const real = /** @type {any} */ (await importOriginal());
  return {
    ...real,
    writeWhole: (/** @type {string} */ file, /** @type {string} */ text) => {
      if (
        /** @type {any} */ (globalThis).__failSettings &&
        file.endsWith('.settings.json')
      )
        throw Object.assign(new Error('EIO: i/o error'), {code: 'EIO'});
      return real.writeWhole(file, text);
    },
  };
});

/** @type {string} */
let cwd;
const BIN = path.resolve(
  import.meta.dirname,
  '../../clients/cli/bin/astryx.mjs',
);

/** Why the bundled base could not be installed here, when it could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt59-', FIXTURE_PACKAGES);
  // The stable build of the copy reads the real base, as an app does.
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
}, 300_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** @param {string} rel */
const read = rel => fs.readFileSync(path.join(cwd, rel), 'utf8');

/**
 * The stable build of the app copy, run from the app as a person runs it
 * (its own process: a theme module is read fresh each time).
 * @param {{check?: boolean}} [options]
 */
const buildCopy = (options = {}) => {
  const r = spawnSync(
    process.execPath,
    [
      BIN,
      '--json',
      'theme',
      'build',
      'src/themes/c/cTheme.ts',
      ...(options.check ? ['--check'] : []),
    ],
    {cwd, encoding: 'utf8'},
  );
  return JSON.parse(r.stdout);
};

describe('hunt59: the app copy and the stable build', () => {
  it('is current to theme build --check after new and set', async test => {
    if (unbuilt) return test.skip();
    await themeEditNew('c', {cwd, like: 'neutral'});
    await themeEditSet('c', 'corners', 'pill', {cwd});
    const r = buildCopy({check: true});
    expect(/** @type {any} */ (r.data).stale).toEqual([]);
    expect(/** @type {any} */ (r.data).upToDate).toBe(true);
    // Each file of the copy names the exact command that writes it.
    for (const f of ['src/themes/c/cTheme.ts', 'src/themes/c/cTheme.doc.mjs'])
      expect(read(f)).toContain(
        'Written by `astryx experimental theme editor show c`',
      );
  }, 240_000);

  it('after a stable rebuild of the copy, the next set still writes it', async test => {
    if (unbuilt) return test.skip();
    buildCopy();
    await themeEditSet('c', 'corners', 'square', {cwd});
    expect(read('src/themes/c/c.css')).toContain(
      ' * Source: src/themes/c/cTheme.ts',
    );
    expect(read('src/themes/c/c.css').split('*/')[1]).toBe(
      read('themes/c/c.css').split('*/')[1],
    );
    const r = buildCopy({check: true});
    expect(/** @type {any} */ (r.data).stale).toEqual([]);
    expect(/** @type {any} */ (r.data).upToDate).toBe(true);
  }, 240_000);
});

describe('hunt59: doctor', () => {
  it('reads the added app copy as built and current', async test => {
    if (unbuilt) return test.skip();
    const run = (/** @type {string[]} */ args) =>
      spawnSync(process.execPath, [BIN, '--json', ...args], {
        cwd,
        encoding: 'utf8',
      });
    expect(run(['theme', 'add', 'c']).status).toBe(0);
    const doctor = JSON.parse(run(['doctor']).stdout);
    const local = (doctor.data.checks ?? []).find(
      (/** @type {any} */ c) => c.id === 'theme-local-builds',
    );
    expect(local?.status ?? 'pass').not.toBe('fail');
  }, 240_000);
});

describe('hunt59: a change that fails after its build', () => {
  it('leaves the app copy as it was', async test => {
    if (unbuilt) return test.skip();
    const before = read('src/themes/c/c.css');
    /** @type {any} */ (globalThis).__failSettings = true;
    try {
      const err = await refusal(() =>
        themeEditSet('c', 'corners', 'round', {cwd}),
      );
      expect(err.message).toMatch(/Nothing was changed|put back/);
    } finally {
      /** @type {any} */ (globalThis).__failSettings = false;
    }
    expect(read('src/themes/c/c.css')).toBe(before);
  }, 240_000);
});

describe('a one-mode theme in the app', () => {
  it('exports its one mode from the build and the copy, so theme add wires it in that mode', async test => {
    if (unbuilt) return test.skip();
    await themeEditSet('c', 'mode', 'dark-only', {cwd});
    try {
      for (const f of ['themes/c/c.js', 'src/themes/c/c.js'])
        expect(read(f)).toContain('export const colorModes = ["dark"];');
      expect(read('src/themes/c/cTheme.ts')).toContain(
        'export {cTheme, colorModes} from',
      );
      // A stable build of the copy writes the same module.
      const check = buildCopy({check: true});
      expect(/** @type {any} */ (check.data).stale).toEqual([]);
      const r = spawnSync(
        process.execPath,
        [BIN, '--json', 'theme', 'add', 'c'],
        {cwd, encoding: 'utf8'},
      );
      expect(r.status, r.stderr).toBe(0);
      const entry = JSON.parse(r.stdout).data.themes.find(
        (/** @type {any} */ t) => t.slug === 'c',
      );
      expect(entry.mode).toBe('dark');
    } finally {
      await themeEditSet('c', 'mode', 'both', {cwd});
    }
    // Both modes again: no export anywhere.
    expect(read('themes/c/c.js')).not.toContain('colorModes');
    expect(read('src/themes/c/cTheme.ts')).not.toContain('colorModes');
  }, 240_000);
});
