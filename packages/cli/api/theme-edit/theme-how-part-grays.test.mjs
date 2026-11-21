// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A gray a part rule sets (the base theme's own, or the theme's), a
 * page color or a part fill the theme sets itself keeps its tint whatever
 * the neutral seed is. The neutral-grays answer
 * names such a part and never says the grays are already neutral while it
 * stays tinted. A part value counts as a gray by its color, so a strong
 * color a part sets is not named as a tinted gray.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-part-grays-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral', 'stone', 'butter']);
  if (!unbuilt) {
    for (const [slug, like] of [
      ['stony', 'stone'],
      ['buttery', 'butter'],
    ]) {
      await themeEditNew(slug, {cwd, like});
      await themeEditSet(slug, 'neutral', '#777777', {cwd});
    }
    await themeEditNew('cream', {cwd, like: 'neutral'});
    await themeEditSet('cream', '--color-background-body', '#faf3e8', {cwd});
    await themeEditNew('creamy', {cwd, like: 'neutral'});
    await themeEditSet('creamy', 'background-color', '#fef3c7', {
      cwd,
      on: 'card',
      when: 'variant:default',
      mode: 'light',
    });
    await themeEditNew('loud', {cwd, like: 'neutral'});
    await themeEditSet('loud', '--color-text-secondary', '#d00000', {
      cwd,
      on: 'card',
    });
  }
}, 600_000);

afterAll(() => removeLinkedFixture(cwd));

/** @param {import('vitest').TestContext} test */
const needsBases = test => {
  if (unbuilt) {
    console.warn(`skipped: ${unbuilt}`);
    test.skip();
  }
};

/** @param {string} theme */
const grays = async theme =>
  /** @type {{text: string, commands: string[]}[]} */ (
    (await themeEditHow('neutral grays', {cwd, theme})).data.results ?? []
  );

const T = 300_000;

describe('part grays', () => {
  it(
    "names a base theme's tinted part grays, never already neutral",
    async test => {
      needsBases(test);
      for (const [theme, part] of [
        ['stony', /card variant muted/],
        ['buttery', /\bcard\b/],
      ]) {
        const [top] = await grays(theme);
        expect(
          top.commands.filter(c => / editor set /.test(c)),
          theme,
        ).toEqual([]);
        expect(top.text, theme).not.toMatch(/already neutral/);
        expect(top.text, theme).toMatch(part);
      }
    },
    T,
  );

  it(
    'names a page color or a part fill the theme sets itself',
    async test => {
      needsBases(test);
      for (const [theme, said] of [
        ['cream', /--color-background-body/],
        ['creamy', /card background-color/],
      ]) {
        const [top] = await grays(theme);
        expect(top.text, theme).not.toMatch(/already neutral/);
        expect(top.text, theme).toMatch(said);
      }
    },
    T,
  );

  it(
    'never names a strong color a part sets as a tinted gray',
    async test => {
      needsBases(test);
      const [top] = await grays('loud');
      expect(top.text).toMatch(/already neutral/);
      expect(top.text).not.toMatch(/\bcard\b/);
    },
    T,
  );
});
