// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A loading placeholder a person cannot see (under 1.2:1 against the
 * page or a surface at its pulse's brightest) is a problem where the
 * theme's own colors make it so, with the nearest placeholder color that
 * shows, and a note (no line) where the base theme draws it so itself.
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {splitCommand} from './_vet.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';
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
/** @type {string} */
let unbuilt = '';
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-placeholder-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
}, T);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

// (Show's problems come from the theme: one small section is drawn.)
const looked = () => ({cwd, section: 'actions'});
/** @param {string} slug */
const placeholder = async slug => {
  const d = /** @type {any} */ (await themeEditShow(slug, looked())).data;
  return {
    open: /** @type {Array<{problem: string, fix: string | null}>} */ (
      d.openProblems
    ).filter(p => /loading placeholder/.test(p.problem)),
    notes: /** @type {string[]} */ (d.notes ?? []).filter(n =>
      /loading placeholder/.test(n),
    ),
  };
};

describe('a loading placeholder', () => {
  it(
    "one the theme's colors hide is a problem whose line makes it show",
    async () => {
      if (unbuilt) return;
      await themeEditNew('k', {cwd, like: 'neutral'});
      await themeEditSet('k', '--color-skeleton', '#ffffff', {
        cwd,
        mode: 'light',
      });
      const {open} = await placeholder('k');
      expect(open.length).toBe(1);
      expect(open[0].fix).toMatch(
        /--color-skeleton '#[0-9a-f]{6}' --mode light$/,
      );
      const line = /** @type {string} */ (open[0].fix);
      const r = await runCli(
        /** @type {string[]} */ (
          splitCommand(line.slice(line.indexOf('experimental ')))
        ),
        {cwd},
      );
      expect(r.status, r.stderr).toBe(0);
      expect((await placeholder('k')).open).toEqual([]);
    },
    T,
  );

  it(
    'one the base theme hides itself is a note, not a problem',
    async () => {
      if (unbuilt) return;
      await themeEditNew('n', {cwd, like: 'neutral'});
      const {open, notes} = await placeholder('n');
      expect(open).toEqual([]);
      // (Shown as the base's own, without a line, until the base draws it
      // so it shows.)
      for (const n of notes)
        expect(n).toMatch(/^the base theme's loading placeholder/);
    },
    T,
  );
});
