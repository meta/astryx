// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The same text in the same color failing on three or more of its
 * ground's variants (a colored card's text in every colored card) is one
 * problem for each text and mode, with each variant's line in one where
 * they have one.
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-variant-problems-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  unbuilt = await installRealBaseThemes(cwd, ['butter']);
  if (!unbuilt) await themeEditNew('g', {cwd, like: 'butter'});
}, T);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('one cause across a ground part variants', () => {
  it('is one problem for each text and mode, never one per variant', async () => {
    if (unbuilt) return;
    // butter's colored cards write their own dark text; an accent that
    // takes the category colors dark in dark leaves it failing on each.
    const r = /** @type {any} */ (
      await themeEditSet('g', 'accent', '#2563eb', {cwd})
    ).data;
    const problems =
      /** @type {Array<{problem: string, fix: string | null}>} */ (
        r.newProblems
      );
    expect(
      problems.filter(p =>
        /^text \(".*"\) in \S+ on \d+ card variants /.test(p.problem),
      ).length,
    ).toBeGreaterThan(0);
    expect(
      problems.filter(p => /\(on card, variant \w+\)/.test(p.problem)),
    ).toEqual([]);
    // Each grouped problem's line, where it has one, is every variant's.
    for (const p of problems.filter(
      x => /card variants/.test(x.problem) && x.fix,
    ))
      for (const one of String(p.fix).split(' && '))
        expect(one).toMatch(/ --on card --when variant:\w+/);
  }, 600_000);
});
