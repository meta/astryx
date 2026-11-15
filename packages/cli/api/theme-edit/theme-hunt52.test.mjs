// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file hunt52 (R23-C): an empty theme folder, or one of system files only,
 * holds no theme yet: the refusal says so and suggests `new <theme>`, which
 * makes it there.
 *
 * @position api/theme-edit — tests
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-hunt52-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
}, 120_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

describe('hunt52: an empty theme folder', () => {
  it('is no theme yet, and new makes it there', async () => {
    fs.mkdirSync(path.join(cwd, 'themes/e'), {recursive: true});
    fs.writeFileSync(path.join(cwd, 'themes/e/.DS_Store'), '');
    for (const run of [
      () => themeEditSet('e', 'corners', 'round', {cwd}),
      () => themeEditShow('e', {cwd}),
    ]) {
      const err = await refusal(run);
      expect(err.code).toBe('ERR_UNKNOWN_THEME');
      expect(err.message).toContain(
        'themes/e is an empty folder: there is no theme e yet',
      );
      expect(err.run.join('\n')).toMatch(/ new e$/m);
      expect(err.run.join('\n')).not.toContain('my-e');
    }
    await themeEditNew('e', {cwd});
    expect(fs.existsSync(path.join(cwd, 'themes/e/e.settings.json'))).toBe(
      true,
    );
  }, 120_000);

  it('a folder holding a file of the user is still not the editor theme', async () => {
    fs.mkdirSync(path.join(cwd, 'themes/h'), {recursive: true});
    fs.writeFileSync(path.join(cwd, 'themes/h/h.css'), ':root{}');
    const err = await refusal(() =>
      themeEditSet('h', 'corners', 'round', {cwd}),
    );
    expect(err.message).toContain('a theme the editor did not make');
  });
});
