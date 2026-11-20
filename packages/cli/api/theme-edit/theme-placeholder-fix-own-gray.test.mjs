// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A placeholder that does not show gets a fix line in the theme's own gray.
 */

import fs from 'node:fs';
import path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
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

/** @param {string} slug */
const css = slug =>
  fs.readFileSync(path.join(cwd, 'themes', slug, `${slug}.css`), 'utf8');

/** The light half of a token in a theme's built CSS. @param {string} slug @param {string} token */
const lightOf = (slug, token) =>
  new RegExp(`${token}: light-dark\\((#[0-9a-f]{6}),`).exec(css(slug))?.[1];

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-role-reach-more-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, ['neutral', 'stone']);
  if (unbuilt) throw new Error(unbuilt);
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('a placeholder that does not show', () => {
  it("a placeholder that does not show gets a fix in the theme's own gray", async () => {
    await themeEditNew('tan', {cwd, like: 'stone'});
    await themeEditSet('tan', 'neutral', '#8b7355', {cwd});
    const page = String(lightOf('tan', '--color-background-body'));
    await themeEditSet('tan', '--color-skeleton', page, {cwd, mode: 'light'});
    const {data} = /** @type {any} */ (await themeEditShow('tan', {cwd}));
    const fix = /** @type {Array<{problem: string, fix: string}>} */ (
      data.openProblems
    ).find(p => /loading placeholder/.test(p.problem))?.fix;
    const color = /--color-skeleton '(#[0-9a-f]{6})'/.exec(String(fix))?.[1];
    const palette = fs.readFileSync(
      path.join(cwd, 'themes', 'tan', 'tokens', 'tan.palette.ts'),
      'utf8',
    );
    expect(color).toBeTruthy();
    expect(palette).toContain(`"${color}"`);
  }, 120_000);
});
