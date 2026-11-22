// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A selected look missed on the base's fill says what the accent
 * tint its line gives draws in dark, and where that is a strong block of
 * the accent (a soft coral's deep red) the line for a softer tint first.
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

const T = 300_000;
/** @type {string} */
let cwd;
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-selected-dark-tint-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
  await themeEditSet('t', 'accent', '#f08070', {cwd});
}, T);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('a selected look on the accent tint', () => {
  it('says what it draws in dark, with a softer tint first where it is strong', async () => {
    const missed =
      /** @type {Array<{part: string, state?: string, why: string}>} */ (
        /** @type {any} */ (await themeEditShow('t', {cwd})).data.missed ?? []
      ).filter(m => m.state === 'selected');
    expect(missed.length).toBeGreaterThan(0);
    for (const m of missed)
      expect(m.why).toMatch(
        /in dark the accent tint draws #[0-9a-f]{6}, a strong block of the accent; for a softer one first: .* set t --color-accent-muted '#[0-9a-f]{6}' --mode dark$/,
      );
    // Once the theme sets the tint itself, only what it draws is said.
    await themeEditSet('t', '--color-accent-muted', '#4d1e1a', {
      cwd,
      mode: 'dark',
    });
    const again = /** @type {Array<{state?: string, why: string}>} */ (
      /** @type {any} */ (await themeEditShow('t', {cwd})).data.missed ?? []
    ).filter(m => m.state === 'selected');
    for (const m of again)
      expect(m.why).toMatch(/in dark the accent tint draws #4d1e1a$/);
  }, 600_000);
});
