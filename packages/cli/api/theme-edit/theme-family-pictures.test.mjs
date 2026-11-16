// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file show --png pictures the families of components the theme sets a
 * part of (the buttons when it sets none), each on a page of its own cut
 * from the full sheet, which is not pictured. Each page holds its family alone, is listed with the pictures,
 * and is named first in the pictures to open.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {FAMILY_OVERVIEW, context} from './_context.mjs';
import {touchedFamilies} from './_preview.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

// The pages are real; a picture is a few bytes where the browser would
// write it.
vi.mock('./_preview.mjs', async importOriginal => {
  const real = /** @type {any} */ (await importOriginal());
  return {
    ...real,
    screenshot: async (
      /** @type {any} */ _project,
      /** @type {string} */ _html,
      /** @type {string} */ png,
    ) => {
      fs.writeFileSync(png, 'png');
      return {ok: true};
    },
  };
});

const T = 300_000;

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-I-family-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('show --png', () => {
  it(
    "pictures a fresh theme's buttons as its one family, cut from the full sheet, and not the full sheet",
    async () => {
      const r = /** @type {any} */ (await themeEditShow('t', {cwd, png: true}));
      const dir = path.join(cwd, 'themes/t');
      expect(r.data.pictures).toEqual([
        'themes/t/preview.png',
        'themes/t/preview-dark.png',
        'themes/t/sheet-overlays.png',
        'themes/t/sheet-overlays-dark.png',
        `themes/t/sheet-${FAMILY_OVERVIEW}.png`,
        `themes/t/sheet-${FAMILY_OVERVIEW}-dark.png`,
      ]);
      const sheet = fs.readFileSync(path.join(dir, 'sheet.html'), 'utf8');
      // The page is cut by its own classes: no data attribute of its own.
      expect(sheet).not.toContain('data-cs-group');
      const family = FAMILY_OVERVIEW;
      const html = fs.readFileSync(
        path.join(dir, `sheet-${family}.html`),
        'utf8',
      );
      // Its own family, and no other, as the full sheet draws it.
      expect(
        [...html.matchAll(/\bcs-family-([a-z-]+)\b/g)].map(m => m[1]),
      ).toEqual([family]);
      expect(html).toContain(`class="cs-page cs-section-${family}"`);
      expect(html).toContain(`<strong>t: every component (${family})</strong>`);
      expect(html).toMatch(/<!-- astryx: sheet of build [0-9a-f]{16} -->\n$/);
      const at = sheet.indexOf(`cs-family-${family}`);
      const own = html.indexOf(`cs-family-${family}`);
      expect(html.slice(own, own + 2000)).toBe(sheet.slice(at, at + 2000));
      expect(r.data.look).toMatch(
        new RegExp(
          `^open themes/t/sheet-${family}\\.png \\(one family of components each\\) and themes/t/preview\\.png`,
        ),
      );
    },
    T,
  );

  it(
    'pictures the families the theme sets a part of, and leaves a file of yours at a family page alone',
    async () => {
      const dir = path.join(cwd, 'themes/t');
      await themeEditSet('t', 'flex-shrink', '0', {cwd, on: 'badge'});
      const touched = touchedFamilies(
        (await context(cwd)).project,
        JSON.parse(fs.readFileSync(path.join(dir, 't.settings.json'), 'utf8')),
      );
      expect(touched).toEqual(['feedback']);
      // The family set takes the overview's place; a file of yours at its
      // page is left alone and named (so its picture is not taken).
      const mine = path.join(dir, 'sheet-feedback.html');
      fs.writeFileSync(mine, '<p>mine</p>');
      const r = /** @type {any} */ (await themeEditShow('t', {cwd, png: true}));
      expect(fs.readFileSync(mine, 'utf8')).toBe('<p>mine</p>');
      expect(r.data.pictures).toEqual([
        'themes/t/preview.png',
        'themes/t/preview-dark.png',
        'themes/t/sheet-overlays.png',
        'themes/t/sheet-overlays-dark.png',
      ]);
      expect(r.data.pictureProblem).toContain('themes/t/sheet-feedback.html');
      fs.rmSync(mine);
    },
    T,
  );
});
