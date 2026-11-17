// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A problem two measured pairs give alike (one text on one fill, over
 * two grounds that resolve to that fill) is said once, with its one line.
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
  cwd = makeLinkedFixture('astryx-theme-problems-said-once-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
}, T);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('problems a change makes', () => {
  it(
    'each is said once with its line',
    async () => {
      const r = /** @type {any} */ (
        await themeEditSet('t', 'background-color', '#8a8a8a', {
          cwd,
          on: 'layout-content',
          mode: 'light',
        })
      ).data;
      const said = /** @type {Array<{problem: string, fix: string | null}>} */ (
        r.newProblems
      ).map(p => `${p.problem} | ${p.fix}`);
      expect(said.length).toBeGreaterThan(0);
      expect(new Set(said).size).toBe(said.length);
    },
    T,
  );
});
