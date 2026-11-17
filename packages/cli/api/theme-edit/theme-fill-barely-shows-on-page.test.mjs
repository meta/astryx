// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A fill the theme sets on a part that sits on the page, within a
 * hair of the page's color and with no border or shadow (a beige banner on
 * a cream page), is said as a note with the line that gives it an edge; a
 * fill that stands out says nothing.
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

const T = 300_000;
/** @type {string} */
let cwd;
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-fill-barely-shows-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
  await themeEditSet('t', '--color-background-body', '#fef3c7', {
    cwd,
    mode: 'light',
  });
}, T);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

const BARELY =
  /^the banner's fill \(#f5f5dc\) is [\d.]+:1 on the page .* barely shows .* set t border '1px solid var\(--color-border\)' --on banner$/;

describe('a fill that barely differs from the page', () => {
  it(
    'is a note with the line that gives the part an edge',
    async () => {
      const r = /** @type {any} */ (
        await themeEditSet('t', 'background-color', '#f5f5dc', {
          cwd,
          on: 'banner',
          mode: 'light',
        })
      ).data;
      expect(
        /** @type {string[]} */ (r.notes).filter(n => BARELY.test(n)),
      ).toHaveLength(1);
      expect(
        /** @type {Array<{problem: string}>} */ (r.newProblems).filter(p =>
          /barely shows/.test(p.problem),
        ),
      ).toEqual([]);
    },
    T,
  );

  it(
    'a fill that stands out says nothing of it',
    async () => {
      const r = /** @type {any} */ (
        await themeEditSet('t', 'background-color', '#1e3a8a', {
          cwd,
          on: 'banner',
          mode: 'light',
        })
      ).data;
      expect(
        /** @type {string[]} */ (r.notes).filter(n => /barely shows/.test(n)),
      ).toEqual([]);
    },
    T,
  );
});
