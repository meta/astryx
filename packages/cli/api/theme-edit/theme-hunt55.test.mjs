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
import {themeEditNew, themeEditSet, themeEditUndo} from './theme-edit.mjs';
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

/** The copy's file, without its first (generated) line. @param {string} rel */
const body = rel =>
  fs.readFileSync(path.join(cwd, rel), 'utf8').split('\n').slice(1).join('\n');

describe('hunt55: the app copy of an editor theme', () => {
  it('is a standard local theme theme add takes, kept in step', async () => {
    await themeEditNew('a', {cwd, like: 'neutral'});
    const dir = path.join(cwd, 'src/themes/a');
    // A font stylesheet only when the theme loads fonts.
    expect(
      fs
        .readdirSync(dir)
        .filter(n => n !== 'a.fonts.css')
        .sort(),
    ).toEqual(['a.css', 'a.d.ts', 'a.js', 'aTheme.doc.mjs', 'aTheme.ts']);
    expect(body('src/themes/a/a.css')).toBe(
      fs.readFileSync(path.join(cwd, 'themes/a/a.css'), 'utf8'),
    );
    await themeEditSet('a', 'corners', 'pill', {cwd});
    expect(body('src/themes/a/a.css')).toBe(
      fs.readFileSync(path.join(cwd, 'themes/a/a.css'), 'utf8'),
    );
    await themeEditUndo('a', {cwd});
    expect(body('src/themes/a/a.js')).toBe(
      fs.readFileSync(path.join(cwd, 'themes/a/a.js'), 'utf8'),
    );
    const r = await themeAdd('a', {cwd});
    expect(JSON.stringify(r.data)).toContain('./themes/a/a.js');
  }, 240_000);
});
