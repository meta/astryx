// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A whole-theme accent set for one mode moves that mode only: the
 * other mode keeps the palette the theme already drew there (a warm gray's
 * grounds and text), never the base theme's.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';
vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;
/** Why a bundled theme could not be installed here, when it could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-accent-one-mode-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
}, 600_000);

afterAll(() => removeLinkedFixture(cwd));

/**
 * Every color token's light half in a theme's built CSS.
 * @param {string} slug
 * @returns {Record<string, string>}
 */
const lightHalves = slug => {
  const css = fs.readFileSync(
    path.join(cwd, 'themes', slug, `${slug}.css`),
    'utf8',
  );
  /** @type {Record<string, string>} */
  const out = {};
  for (const m of css.matchAll(
    /(--color-[a-z0-9-]+): light-dark\((#[0-9a-f]{6,8}),/g,
  ))
    out[m[1]] ??= m[2];
  return out;
};

const T = 300_000;

describe('an accent set for one mode', () => {
  it(
    'leaves the other mode exactly as the theme drew it',
    async test => {
      if (unbuilt) {
        console.warn(`skipped: ${unbuilt}`);
        test.skip();
      }
      await themeEditNew('w', {cwd, like: 'neutral'});
      await themeEditSet('w', 'neutral', '#78716c', {cwd});
      const before = lightHalves('w');
      // (The warm gray reaches the light grounds.)
      expect(before['--color-background-body']).not.toBe('#f1f1f1');
      await themeEditSet('w', '--color-accent', '#7c3aed', {
        cwd,
        mode: 'dark',
      });
      const after = lightHalves('w');
      for (const [token, color] of Object.entries(before))
        expect(after[token] ?? color, token).toBe(color);
    },
    T,
  );

  it(
    'on a theme with no colors of its own, the other mode follows the base theme: read from it, never written out',
    async test => {
      if (unbuilt) {
        console.warn(`skipped: ${unbuilt}`);
        test.skip();
      }
      await themeEditNew('plain', {cwd, like: 'neutral'});
      await themeEditNew('one', {cwd, like: 'neutral'});
      await themeEditSet('one', '--color-accent', '#7c3aed', {
        cwd,
        mode: 'light',
      });
      // (Every token the accent moves keeps its dark half as a read of the
      // base theme, so a later base theme's dark colors reach it.)
      const source = fs.readFileSync(
        path.join(cwd, 'themes', 'one', 'one.settings.ts'),
        'utf8',
      );
      const pairs = [
        ...source.matchAll(
          /"(--color-[a-z0-9-]+)": \[\s*([^,\n]+),\s*([^\n]+?)\s*\]/g,
        ),
      ];
      expect(pairs.length).toBeGreaterThan(0);
      for (const [, token, , dark] of pairs)
        expect(dark, token).toBe(`baseIn(${JSON.stringify(token)}, 'dark')`);
      // (And it draws what the base theme draws there.)
      const darks = (/** @type {string} */ slug) => {
        const css = fs.readFileSync(
          path.join(cwd, 'themes', slug, `${slug}.css`),
          'utf8',
        );
        /** @type {Record<string, string>} */
        const out = {};
        for (const m of css.matchAll(
          /(--color-[a-z0-9-]+): light-dark\(([^,]+), ([^)]+)\);/g,
        ))
          out[m[1]] ??= m[3].toLowerCase();
        return out;
      };
      const plain = darks('plain');
      for (const [token, color] of Object.entries(darks('one')))
        if (plain[token]) expect(color, token).toBe(plain[token]);
    },
    T,
  );
});
