// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `missed` frames only what draws a box, and never with a width of
 * zero; the starter app names only font sheets that can exist, refuses a
 * theme that imports a stylesheet in another language than CSS, and names
 * a package or version-control entry as left out whatever kind of entry it
 * is.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  themeEditNew,
  themeEditPreviewApp,
  themeEditSet,
  themeEditShow,
} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

// The assertions are about settings, notes and lines, not rendered pages:
// a render costs seconds, so the pages are written by the stand-in.
vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

const T = 300_000;
/** @type {string} */
let cwd;
beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-hunt229-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
}, T);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} slug */
const missed = async slug =>
  /** @type {Array<{part: string, why: string}>} */ (
    /** @type {any} */ (await themeEditShow(slug, {cwd})).data.missed
  );

describe('missed borders', () => {
  it(
    'with the border width at zero, nothing is missed for want of a border',
    async () => {
      await themeEditNew('z', {cwd, like: 'neutral'});
      const r = /** @type {any} */ (
        await themeEditSet('z', '--border-width', '0', {cwd})
      ).data;
      expect(r.missed ?? 0).toBe(0);
      expect((await missed('z')).some(m => /borderless/.test(m.why))).toBe(
        false,
      );
    },
    T,
  );

  it(
    'a part that draws no box at rest gets no frame',
    async () => {
      await themeEditNew('w', {cwd, like: 'neutral'});
      await themeEditSet('w', '--border-width', '3px', {cwd});
      const parts = (await missed('w')).map(m => m.part);
      expect(parts).not.toContain('toggle-button');
      expect(parts).not.toContain('item');
    },
    T,
  );
});

describe('the starter app', () => {
  it(
    'names only font sheets a package can have',
    async () => {
      await themeEditNew('f', {cwd, like: 'neutral'});
      await themeEditSet(
        'f',
        '--font-family-body',
        "'Zzyzx Sans', sans-serif",
        {
          cwd,
        },
      );
      await themeEditSet('f', '--font-weight-semibold', '650', {cwd});
      const r = /** @type {any} */ (
        await themeEditPreviewApp('apps/f', {cwd, theme: 'f'})
      );
      const note = JSON.stringify(r.data);
      expect(note).toContain('zzyzx-sans/600.css');
      expect(note).toContain('zzyzx-sans/700.css');
      expect(note).not.toContain('650.css');
    },
    T,
  );

  it(
    'refuses a theme that imports a Sass file, writing nothing',
    async () => {
      await themeEditNew('s', {cwd, like: 'neutral'});
      const theme = path.join(cwd, 'themes/s/s.theme.ts');
      fs.writeFileSync(
        theme,
        fs.readFileSync(theme, 'utf8') + "\nimport './extra.scss';\n",
      );
      fs.writeFileSync(path.join(cwd, 'themes/s/extra.scss'), '.x{color:red}');
      await expect(
        themeEditPreviewApp('apps/s', {cwd, theme: 's'}),
      ).rejects.toThrow(/another language than CSS/);
      expect(fs.existsSync(path.join(cwd, 'apps/s'))).toBe(false);
    },
    T,
  );

  it(
    'names a link called node_modules or .hg as left out, with no advice to copy it',
    async () => {
      await themeEditNew('l', {cwd, like: 'neutral'});
      fs.symlinkSync(cwd, path.join(cwd, 'themes/l/node_modules'));
      fs.symlinkSync(cwd, path.join(cwd, 'themes/l/.hg'));
      const r = /** @type {any} */ (
        await themeEditPreviewApp('apps/l', {cwd, theme: 'l'})
      );
      const text = JSON.stringify(r.data);
      expect(text).toMatch(/no part of the theme/);
      expect(text).not.toMatch(/bring it along/);
    },
    T,
  );
});
