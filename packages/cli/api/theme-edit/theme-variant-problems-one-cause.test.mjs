// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The same text in the same color failing on three or more of its
 * ground's variants (a colored card's own text on the dark fills a theme
 * gives three colored cards) is one problem for each text and mode, with
 * each variant's line in one where they have one.
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
    // butter's colored cards write their own dark text; dark fills the
    // theme gives three of them leave that text failing on each.
    for (const v of ['blue', 'green', 'purple'])
      await themeEditSet('g', 'background-color', '#1e293b', {
        cwd,
        on: 'card',
        when: `variant:${v}`,
      });
    const r = /** @type {any} */ (await themeEditShow('g', {cwd})).data;
    const problems =
      /** @type {Array<{problem: string, fix: string | null}>} */ (
        r.openProblems
      );
    const grouped = problems.filter(p =>
      /^text \(".*"\) in \S+ on 3 card variants \(blue, green, purple\) /.test(
        p.problem,
      ),
    );
    expect(grouped.length).toBeGreaterThan(0);
    expect(
      problems.filter(p => /\(on card, variant \w+\)/.test(p.problem)),
    ).toEqual([]);
    // Each grouped problem's line, where it has one, is every variant's.
    for (const p of grouped.filter(x => x.fix)) {
      const lines = String(p.fix).split(' && ');
      expect(lines).toHaveLength(3);
      for (const one of lines)
        expect(one).toMatch(/ --on card --when variant:(?:blue|green|purple) /);
    }
  }, 600_000);
});
