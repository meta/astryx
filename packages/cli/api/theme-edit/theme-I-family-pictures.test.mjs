// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file show --png takes each family of components on a page of its own,
 * cut from the full sheet, beside the full sheet (too tall to read whole):
 * each page holds its family alone, is listed with the pictures, and is
 * named first in the pictures to open.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditShow} from './theme-edit.mjs';
import {FAMILY_SECTIONS} from './_context.mjs';
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
    'takes each family of components on a page of its own, and leaves a file of yours at a family page alone',
    async () => {
      const dir = path.join(cwd, 'themes/t');
      // One run for both: a file of yours at one family's page.
      const mine = path.join(dir, 'sheet-inputs.html');
      fs.writeFileSync(mine, '<p>mine</p>');
      const r = /** @type {any} */ (await themeEditShow('t', {cwd, png: true}));
      expect(fs.readFileSync(mine, 'utf8')).toBe('<p>mine</p>');
      expect(r.data.pictures).not.toContain('themes/t/sheet-inputs.png');
      expect(r.data.pictureProblem).toContain('themes/t/sheet-inputs.html');
      const sheet = fs.readFileSync(path.join(dir, 'sheet.html'), 'utf8');
      for (const family of FAMILY_SECTIONS.filter(f => f !== 'inputs')) {
        const html = fs.readFileSync(
          path.join(dir, `sheet-${family}.html`),
          'utf8',
        );
        // Its own family, and no other.
        const groups = [...html.matchAll(/data-cs-group="([a-z-]+)"/g)].map(
          m => m[1],
        );
        expect(groups, family).toEqual([family]);
        expect(html).toContain(`class="cs-page cs-section-${family}"`);
        expect(html).toContain(
          `<strong>t: every component (${family})</strong>`,
        );
        expect(html).toMatch(/<!-- astryx: sheet of build [0-9a-f]{16} -->\n$/);
        // As the full sheet draws it.
        const at = sheet.indexOf(`data-cs-group="${family}"`);
        const own = html.indexOf(`data-cs-group="${family}"`);
        expect(html.slice(own, own + 2000)).toBe(sheet.slice(at, at + 2000));
        expect(r.data.pictures).toContain(`themes/t/sheet-${family}.png`);
      }
      // The full sheet stays, and the family pictures are named first.
      expect(r.data.pictures).toContain('themes/t/sheet.png');
      expect(r.data.look).toMatch(
        /^open themes\/t\/sheet-actions\.png, .*\(one family of components each\) and themes\/t\/preview\.png/,
      );
    },
    T,
  );
});
