// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The button style (`buttons outline`, `soft`) writes the primary
 * variant's own rule, which is more specific than an exact property on
 * the button's plain rule: set never says the exact property wins there,
 * and the primary label is measured on the fill an exact property gives
 * that variant, whenever it was set.
 *
 * @position api/theme-edit — tests
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;
/** Why a bundled base could not be installed here, when one could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-buttons-style-over-exact-',
    FIXTURE_PACKAGES,
  );
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
}, 600_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

describe('buttons outline over a primary fill and a plain button color', () => {
  it('names no exact property as winning, and measures the primary label on its fill', async test => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      test.skip();
    }
    await themeEditNew('o', {cwd, like: 'neutral'});
    await themeEditSet('o', 'accent', '#b8975a', {cwd});
    await themeEditSet('o', 'background-color', '#ca8a04', {
      cwd,
      on: 'button',
      when: 'variant:primary',
    });
    await themeEditSet('o', 'color', '#000000', {cwd, on: 'button'});
    const r = /** @type {any} */ (
      await themeEditSet('o', 'buttons', 'outline', {cwd})
    );
    const said = JSON.stringify(r.data);
    expect(said).not.toMatch(/is an exact property and wins over buttons/);
    expect(
      (r.data.problems ?? []).some((/** @type {string} */ p) =>
        /text in button \(variant primary, buttons outline\) is .* on #ca8a04/.test(
          p,
        ),
      ),
    ).toBe(true);
  }, 300_000);
});
