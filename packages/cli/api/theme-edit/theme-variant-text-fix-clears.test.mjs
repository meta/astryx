// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Text a base colors through the part around it (butter's colored
 * cards) gets a line that sets that token on the part in its variant, and
 * once the theme sets it there the problem is measured with it and clears.
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

const T = 300_000;
/** @type {string} */
let cwd;
let unbuilt = '';
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-variant-text-fix-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  unbuilt = await installRealBaseThemes(cwd, ['butter']);
  if (!unbuilt) await themeEditNew('b', {cwd, like: 'butter'});
}, T);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {any} r */
const onBlue = r =>
  /** @type {Array<{problem: string, fix: string | null}>} */ (
    r.data.openProblems ?? r.data.newProblems
  ).filter(p => /\(on card, variant blue\)/.test(p.problem));

describe("text the base colors through a card's variant", () => {
  it(
    'gets the line on the card, and clears once it is set',
    async () => {
      if (unbuilt) return;
      const set = await themeEditSet('b', 'background-color', '#c1c6e0', {
        cwd,
        on: 'card',
        when: 'variant:blue',
        mode: 'dark',
      });
      const found = onBlue(set);
      expect(found.length).toBeGreaterThan(0);
      // Each line sets a text role on the card's variant, in dark; following
      // every one clears them.
      const lines = new Set(found.map(p => String(p.fix)));
      for (const line of lines) {
        const m =
          / set b (--color-text-(?:primary|secondary|accent)) '(#[0-9a-f]{6})' --on card --when variant:blue --mode dark$/.exec(
            line,
          );
        expect(m, line).toBeTruthy();
        await themeEditSet('b', String(m?.[1]), String(m?.[2]), {
          cwd,
          on: 'card',
          when: 'variant:blue',
          mode: 'dark',
        });
      }
      expect(onBlue(await themeEditShow('b', {cwd}))).toEqual([]);
    },
    T,
  );
});
