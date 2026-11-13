// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file hunt55: every build of an editor theme writes its app copy, a
 * standard local theme in src/themes/<theme>/ that `theme add` reads, kept
 * in step with set, undo and compile; a folder there of the user's is never
 * written.
 *
 * @position api/theme-edit — tests
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {
  themeEditNew,
  themeEditSet,
  themeEditShow,
  themeEditUndo,
} from './theme-edit.mjs';
import {themeAdd} from '../theme/theme.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

/** @type {string} */
let cwd;

beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-hunt55-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
}, 120_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** A built file without its Source and Command header lines. @param {string} rel */
const body = rel =>
  fs
    .readFileSync(path.join(cwd, rel), 'utf8')
    .replace(/^ \* (Source|Command): .*\n/gm, '');

describe('hunt55: the app copy of an editor theme', () => {
  it('is a standard local theme theme add takes, kept in step', async () => {
    await themeEditNew('a', {cwd, like: 'neutral'});
    const dir = path.join(cwd, 'src/themes/a');
    // A font stylesheet only when the theme loads fonts.
    expect(
      fs
        .readdirSync(dir)
        // Font and variant types only when the theme has them.
        .filter(n => n !== 'a.fonts.css' && n !== 'a.variants.d.ts')
        .sort(),
    ).toEqual([
      'a.css',
      'a.css.d.ts',
      'a.d.ts',
      'a.js',
      'aTheme.doc.mjs',
      'aTheme.ts',
    ]);
    expect(body('src/themes/a/a.css')).toBe(body('themes/a/a.css'));
    await themeEditSet('a', 'corners', 'pill', {cwd});
    expect(body('src/themes/a/a.css')).toBe(body('themes/a/a.css'));
    await themeEditUndo('a', {cwd});
    expect(body('src/themes/a/a.js')).toBe(body('themes/a/a.js'));
    const r = await themeAdd('a', {cwd});
    expect(JSON.stringify(r.data)).toContain('./themes/a/a.js');
  }, 240_000);
});

describe('hunt55b: the first write of the app copy is named', () => {
  it('by new, then quiet; by the first set or show that writes it again', async () => {
    const made = await themeEditNew('b', {cwd, like: 'neutral'});
    const first = /** @type {any} */ (made.data).appCopy;
    expect(first.wrote).toContain('src/themes/b/bTheme.doc.mjs');
    expect(first.wrote).toContain('src/themes/b/b.css');
    const again = await themeEditSet('b', 'corners', 'pill', {cwd});
    expect(/** @type {any} */ (again.data).appCopy).toBeUndefined();
    // An older theme with no copy yet: its first build names it.
    fs.rmSync(path.join(cwd, 'src/themes/b'), {recursive: true, force: true});
    const set = await themeEditSet('b', 'corners', 'round', {cwd});
    expect(/** @type {any} */ (set.data).appCopy.wrote).toContain(
      'src/themes/b/bTheme.ts',
    );
    fs.rmSync(path.join(cwd, 'src/themes/b'), {recursive: true, force: true});
    const shown = await themeEditShow('b', {cwd});
    expect(/** @type {any} */ (shown.data).appCopy.wrote).toContain(
      'src/themes/b/b.js',
    );
    const quiet = await themeEditShow('b', {cwd});
    expect(/** @type {any} */ (quiet.data).appCopy).toBeUndefined();
  }, 240_000);
});
