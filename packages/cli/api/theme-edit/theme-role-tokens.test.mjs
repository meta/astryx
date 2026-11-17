// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A role color the base theme takes away from a part on its own (the
 * base pointing the role tokens at others there, as stone's info banner on
 * its categorical blue, or a variant named for the role drawn in a color of
 * its palette written out, as stone's accent progress fill) is reached by
 * the theme's role color once the theme moves that role: the part takes
 * it, and the missed list does not list it. An untouched base lists none.
 */

import fs from 'node:fs';
import path from 'node:path';

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditShow} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

const T = 400_000;
/** @type {string} */
let cwd;
// (Show's open problems and missed list come from the theme, not from the
// sheet it writes: one small section of the sheet is drawn, not all of it.)
const looked = () => ({cwd, section: 'actions'});
/** @type {string} */
let unbuilt = '';
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-role-tokens-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  unbuilt = await installRealBaseThemes(cwd, ['neutral', 'stone', 'gothic']);
}, T);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} slug */
const roleMisses = async slug =>
  /** @type {Array<{part: string, why: string, line: string}>} */ (
    /** @type {any} */ (await themeEditShow(slug, looked())).data.missed ?? []
  ).filter(x => /base theme points|palette written out/.test(x.why));

/** A rule's body by its selector. @param {string} slug @param {string} selector */
const rule = (slug, selector) =>
  new RegExp(
    `\\n {2}${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`,
  ).exec(
    fs.readFileSync(path.join(cwd, 'themes', slug, `${slug}.css`), 'utf8'),
  )?.[1] ?? '';

describe('a role color the base takes away from a part', () => {
  it(
    'lists nothing on an untouched base',
    async () => {
      if (unbuilt) return;
      await themeEditNew('s0', {
        cwd,
        like: 'stone',
        settings: {corners: 'round'},
      });
      expect(await roleMisses('s0')).toEqual([]);
    },
    T,
  );

  it(
    "stone's info banner and accent progress fill take the theme's colors, so neither is listed",
    async () => {
      if (unbuilt) return;
      await themeEditNew('s', {
        cwd,
        like: 'stone',
        settings: {info: '#6b21a8', accent: '#c2410c'},
      });
      expect(await roleMisses('s')).toEqual([]);
      const banner = rule('s', '.astryx-banner[data-status="info"]');
      expect(banner).toMatch(/--color-info-muted: (light-dark\()?#/);
      expect(banner).toMatch(/--color-on-info-muted: (light-dark\()?#/);
      expect(
        rule('s', '.astryx-progress-bar-fill[data-variant="accent"]'),
      ).toMatch(/background-color: var\(--color-accent\);/);
    },
    T,
  );

  it(
    "gothic's info banner takes the theme's info",
    async () => {
      if (unbuilt) return;
      await themeEditNew('g', {
        cwd,
        like: 'gothic',
        settings: {info: '#ff00e6'},
      });
      expect(await roleMisses('g')).toEqual([]);
      expect(rule('g', '.astryx-banner[data-status="info"]')).toMatch(
        /--color-info-muted: (light-dark\()?#/,
      );
    },
    T,
  );
});
