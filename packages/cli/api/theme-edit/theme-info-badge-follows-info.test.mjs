// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A base theme's info badge drawn in a categorical color follows the theme's info color.
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

describe('an info badge drawn in another family', () => {
  it("stone's info badge, drawn in the categorical blue, follows the info color", async () => {
    await themeEditNew('trail', {cwd, like: 'stone'});
    await themeEditSet('trail', 'info', '#66662e', {cwd});
    const badge =
      /\.astryx-badge\[data-variant="info"\] \{([^}]*)\}/.exec(
        css('trail'),
      )?.[1] ?? '';
    expect(badge).toMatch(/background-color: var\(--color-info-muted\);/);
    expect(badge).toMatch(/color: var\(--color-on-info-muted\);/);
  }, 120_000);
});
