// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A neutral color whose shades are the base theme's own grays (black,
 * white, or a pure gray) changes no page, surface, text or border color:
 * the set result says so, and how to get dark surfaces, instead of a bare
 * [ok]; a colored gray, which tints them, gets no such note.
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
  cwd = makeLinkedFixture('astryx-theme-d-grays-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} slug @param {string} seed */
const notesOf = async (slug, seed) => {
  await themeEditNew(slug, {cwd, like: 'neutral'});
  const {data} = /** @type {any} */ (
    await themeEditSet(slug, 'neutral', seed, {cwd})
  );
  return /** @type {string[]} */ (data.notes).join('\n');
};

describe('a neutral color that grows the base theme grays', () => {
  it.each([
    ['black', '#000000'],
    ['white', '#ffffff'],
  ])(
    '%s says the page, surfaces, text and borders keep their colors',
    async (slug, seed) => {
      expect(await notesOf(slug, seed)).toMatch(
        new RegExp(
          `neutral ${seed} grows the same grays the neutral theme already shows, so its page, surfaces, text and borders keep their colors.*For dark surfaces: .* set ${slug} mode dark-only`,
        ),
      );
    },
    120_000,
  );

  it('a colored gray, which tints them, gets no such note', async () => {
    expect(await notesOf('slate', '#64748b')).not.toMatch(
      /grows the same grays/,
    );
  }, 120_000);
});
