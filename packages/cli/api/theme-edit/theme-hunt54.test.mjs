// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file hunt54: `new` and `show` give the exact steps that put the theme
 * into this app; a token set on a group names the members that read it
 * and what the others read, and a part that never reads it is refused.
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
  cwd = makeLinkedFixture('astryx-theme-hunt54-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
}, 120_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

describe('hunt54 (A): the wiring for this app', () => {
  it('names theme add for the app copy the editor writes', async () => {
    const r = await themeEditNew('w', {cwd, like: 'neutral'});
    const wiring = /** @type {any} */ (r.data).wiring.join('\n');
    expect(wiring).toMatch(/ theme add w: adds the theme's app copy/);
    expect(wiring).toContain('experimental theme compile themes/w/w.theme.ts');
  }, 120_000);

  it('with a file of the user at a copy name in src/themes/v, the steps by hand', async () => {
    fs.mkdirSync(path.join(cwd, 'src/themes/v'), {recursive: true});
    fs.writeFileSync(path.join(cwd, 'src/themes/v/vTheme.ts'), 'mine');
    try {
      const r = await themeEditNew('v', {cwd, like: 'neutral'});
      const wiring = /** @type {any} */ (r.data).wiring.join('\n');
      expect(wiring).toContain("import {vTheme} from './themes/v/v'");
      expect(wiring).toContain('<Theme theme={vTheme}>{children}</Theme>');
      expect(fs.readdirSync(path.join(cwd, 'src/themes/v'))).toEqual([
        'vTheme.ts',
      ]);
    } finally {
      fs.rmSync(path.join(cwd, 'src'), {recursive: true, force: true});
    }
  }, 120_000);
});

describe('hunt54 (B): a token on a group', () => {
  it('names the members that read it and what the others read', async () => {
    const r = await themeEditSet('w', '--focus-outline-width', '2px', {
      cwd,
      on: 'inputs',
    });
    const note = String(/** @type {any} */ (r.data).setting.note);
    expect(note).toMatch(/read --focus-outline-width and take this change/);
    expect(note).toMatch(/text-input reads /);
  }, 120_000);

  it('a part that never reads it is refused for no effect', async () => {
    const err = await refusal(() =>
      themeEditSet('w', '--focus-outline-width', '2px', {
        cwd,
        on: 'text-input',
        only: true,
      }),
    );
    expect(err.code).toBe('ERR_THEME_NO_EFFECT');
  }, 120_000);
});
