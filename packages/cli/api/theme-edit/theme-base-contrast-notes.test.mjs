// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file show names the base theme's own contrast failures as notes, one per
 * cause, each with the line that fixes it in this theme where one does,
 * never as the theme's problems; a change says them only when it brings
 * them. Text on a part that sets no color of its own takes its text color
 * as the part it sits on points it (butter's colored cards write their own
 * text colors), in the theme's look and the base theme's alike.
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
  cwd = makeLinkedFixture(
    'astryx-theme-base-contrast-notes-',
    FIXTURE_PACKAGES,
  );
  writeFixtureBaseTheme(cwd, 'neutral');
  unbuilt = await installRealBaseThemes(cwd, ['butter']);
  if (!unbuilt) await themeEditNew('b', {cwd, like: 'butter'});
}, T);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

const MUTED =
  /^the base theme's .* on --color-background-muted is 1\.2\d:1 in dark, in \d+ texts: /;

describe("the base theme's own contrast failures", () => {
  it(
    'show names them as notes, one per cause, never as problems',
    async () => {
      if (unbuilt) return;
      const r = /** @type {any} */ (await themeEditShow('b', {cwd})).data;
      const notes = /** @type {string[]} */ (r.notes);
      const base = notes.filter(n => n.startsWith("the base theme's "));
      expect(base.filter(n => MUTED.test(n))).toHaveLength(1);
      expect(new Set(base).size).toBe(base.length);
      // Where the editor can fix one, its line is said with it.
      expect(
        base.some(n => / to fix it in this theme: .* set b /.test(n)),
      ).toBe(true);
      expect(
        /** @type {Array<{problem: string}>} */ (r.openProblems).filter(p =>
          p.problem.startsWith("the base theme's "),
        ),
      ).toEqual([]);
    },
    T,
  );

  it(
    'a change that does not bring one does not say it',
    async () => {
      if (unbuilt) return;
      const r = /** @type {any} */ (
        await themeEditSet('b', 'accent', '#2563eb', {cwd})
      ).data;
      expect(
        /** @type {string[]} */ (r.notes).filter(n => MUTED.test(n)),
      ).toEqual([]);
    },
    T,
  );

  it(
    "measures a colored card's text in the color the base theme gives it there",
    async () => {
      if (unbuilt) return;
      // butter's blue card writes its own dark text in both modes: on a light
      // blue in dark it reads, so no problem.
      const r = /** @type {any} */ (
        await themeEditSet('b', 'background-color', '#d7e6ff', {
          cwd,
          on: 'card',
          when: 'variant:blue',
          mode: 'dark',
        })
      ).data;
      expect(
        /** @type {Array<{problem: string}>} */ (r.newProblems).filter(p =>
          /variant blue/.test(p.problem),
        ),
      ).toEqual([]);
    },
    T,
  );
});
