// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The palette recipe an editor theme's colors are made with: a new
 * palette names the newest one; a palette saved before it (its config names
 * none) keeps the first one through a color change, which says how to move
 * it, so a CLI upgrade never moves a theme's colors.
 */

import fs from 'node:fs';
import path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {generatePaletteSet} from '../theme/palette/generate/generator.mjs';
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
const configFile = slug =>
  path.join(cwd, 'themes', slug, 'palette.config.json');
/** @param {string} slug */
const config = slug => JSON.parse(fs.readFileSync(configFile(slug), 'utf8'));

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-d-recipe-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
  await themeEditNew('fresh', {cwd, like: 'neutral'});
  await themeEditSet('fresh', 'accent', '#7c3aed', {cwd});
  // A theme saved before the newest recipe: its config names none.
  await themeEditNew('old', {cwd, like: 'neutral'});
  await themeEditSet('old', 'accent', '#7c3aed', {cwd});
  const c = config('old');
  delete c.recipe;
  fs.writeFileSync(configFile('old'), `${JSON.stringify(c, null, 2)}\n`);
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('the palette recipe of an editor theme', () => {
  it('a new palette names the newest recipe', () => {
    expect(config('fresh').recipe).toBe('astryx-oklch-v3');
  });

  it('a palette saved before it keeps the first through a color change, and says how to move it', async () => {
    const {data} = /** @type {any} */ (
      await themeEditSet('old', 'accent', '#0f766e', {cwd})
    );
    const now = config('old');
    expect(now.recipe).toBeUndefined();
    expect(now.families[0].seed).toBe('#0f766e');
    expect(generatePaletteSet(now).recipe).toBe('astryx-oklch-v1');
    expect(data.notes.join('\n')).toMatch(
      /makes its colors with the astryx-oklch-v1 recipe it was made with.*"recipe": "astryx-oklch-v3" there/,
    );
  });
});
