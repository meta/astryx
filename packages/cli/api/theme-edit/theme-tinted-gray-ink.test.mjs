// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Primary text and icons of a gray map as `themePalette()` maps them: the
 * ramp's black and white ends, for a tinted gray and a pure gray alike.
 */

import fs from 'node:fs';
import path from 'node:path';
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

/** @param {string} slug @param {string} token @returns {[string, string]} */
const halves = (slug, token) => {
  const css = fs.readFileSync(
    path.join(cwd, 'themes', slug, `${slug}.css`),
    'utf8',
  );
  const m = new RegExp(
    `${token}: light-dark\\((#[0-9a-f]{6}), (#[0-9a-f]{6})\\)`,
  ).exec(css);
  if (!m) throw new Error(`${token} is not a light-dark() pair in ${slug}`);
  return [m[1], m[2]];
};

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-tinted-ink-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('primary ink of a gray', () => {
  it('a slate gray keeps black and white primary text and icons', async () => {
    await themeEditNew('slate', {cwd, like: 'neutral'});
    await themeEditSet('slate', 'neutral', '#64748b', {cwd});
    for (const token of ['--color-text-primary', '--color-icon-primary']) {
      expect(halves('slate', token), token).toEqual(['#000000', '#ffffff']);
    }
  }, 240_000);

  it('a pure gray keeps black and white', async () => {
    await themeEditNew('gray', {cwd, like: 'neutral'});
    await themeEditSet('gray', 'neutral', '#777777', {cwd});
    expect(halves('gray', '--color-text-primary')).toEqual([
      '#000000',
      '#ffffff',
    ]);
  }, 240_000);

  it('a slate gray draws the text on a dark surface as a pure gray does', () => {
    expect(halves('slate', '--color-on-dark')).toEqual(
      halves('gray', '--color-on-dark'),
    );
  });
});
