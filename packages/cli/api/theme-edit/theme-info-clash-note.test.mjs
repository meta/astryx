// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A colored accent far from the base theme's info hue, with info
 * unset (a pink theme over a bright blue info), says that info keeps the
 * base's color and offers an info between the two hues; an accent near
 * info's hue, or a theme that sets info, gets no such note.
 */

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

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-info-clash-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} slug @param {string} accent @param {Record<string, string>} [settings] */
const notesOf = async (slug, accent, settings = {}) => {
  await themeEditNew(slug, {cwd, like: 'neutral', settings});
  const {data} = /** @type {any} */ (
    await themeEditSet(slug, 'accent', accent, {cwd})
  );
  return /** @type {string[]} */ (data.notes).join('\n');
};

describe('an info hue the palette does not share', () => {
  it('a pink accent says info keeps the base blue, with an info between the two', async () => {
    expect(await notesOf('pink', '#f4a7c0')).toMatch(
      /info \(banners, info badges\) keeps the base theme's #0074e2, a hue your accent #f4a7c0 does not share; .* set pink info '#[0-9a-f]{6}'/,
    );
  }, 120_000);

  it('a blue accent, or a theme that sets info, gets no such note', async () => {
    expect(await notesOf('blue', '#2563eb')).not.toMatch(/info \(banners/);
    expect(await notesOf('setinfo', '#f4a7c0', {info: '#7e4fae'})).not.toMatch(
      /info \(banners/,
    );
  }, 120_000);
});
