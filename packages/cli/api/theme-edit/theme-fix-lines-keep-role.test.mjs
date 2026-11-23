// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file What a change reports keeps to what it did: a link color too faint
 * is fixed with the nearest shade of its own color that reads, never the
 * plain black or white of body text; a light-only border reports nothing
 * about the dark frame it left as the theme draws it; and one fill on a
 * group of parts says what it covers once for each kind of cover, not
 * once for each part.
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

const T = 400_000;
/** @type {string} */
let cwd;
beforeAll(() => {
  cwd = makeLinkedFixture(
    'astryx-theme-fix-lines-keep-role-',
    FIXTURE_PACKAGES,
  );
  writeFixtureBaseTheme(cwd, 'neutral');
});
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('what a change reports', () => {
  it(
    'fixes a faint link color with a shade of its own color, not black or white',
    async () => {
      await themeEditNew('l', {cwd, like: 'neutral'});
      await themeEditSet('l', '--color-background-body', '#000000', {
        cwd,
        mode: 'dark',
      });
      const r = /** @type {any} */ (
        await themeEditSet('l', '--color-text-accent', '#0070f3', {cwd})
      ).data;
      const fixes = r.newProblems
        .map((/** @type {any} */ p) => String(p.fix ?? ''))
        .filter((/** @type {string} */ f) => / --color-text-accent /.test(f));
      expect(fixes.length).toBeGreaterThan(0);
      for (const f of fixes) expect(f).not.toMatch(/'#(000000|ffffff)'/);
    },
    T,
  );

  it(
    'reports no dark problem for a border set for light alone',
    async () => {
      await themeEditNew('b', {
        cwd,
        like: 'neutral',
        settings: {neutral: '#64748d'},
      });
      const r = /** @type {any} */ (
        await themeEditSet(
          'b',
          'border',
          '1px solid light-dark(#d5dbe1, var(--color-border-emphasized))',
          {cwd, on: 'inputs'},
        )
      ).data;
      expect(
        r.newProblems.filter((/** @type {any} */ p) =>
          /^the border on .* in dark;/.test(p.problem),
        ),
      ).toEqual([]);
    },
    T,
  );

  it(
    'says what one fill on a group covers once for each kind of cover',
    async () => {
      await themeEditNew('i', {cwd, like: 'neutral'});
      const r = /** @type {any} */ (
        await themeEditSet('i', 'background-color', '#ffffff', {
          cwd,
          on: 'inputs',
          mode: 'light',
        })
      ).data;
      const covers = /** @type {string[]} */ (r.notes).filter(n =>
        / now covers? the fill Core gives/.test(n),
      );
      expect(covers.length).toBeGreaterThan(0);
      expect(covers.length).toBeLessThan(r.parts.length);
    },
    T,
  );
});
