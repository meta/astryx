// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A setting on one member of a group that spreads, under a variant
 * of that member (`--on selector --when variant:secondary`), reaches only
 * the members that have that variant, never every member of the group.
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
  cwd = makeLinkedFixture('astryx-theme-set-group-variant-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
}, 600_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

describe('a variant setting on a group member', () => {
  it('reaches the members with that variant only', async test => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      test.skip();
    }
    await themeEditNew('g', {cwd, like: 'neutral'});
    const r = /** @type {any} */ (
      await themeEditSet('g', 'color', 'var(--color-text-primary)', {
        cwd,
        on: 'selector',
        when: 'variant:secondary',
        mode: 'dark',
      })
    );
    const parts = r.data.setting?.parts ?? r.data.parts ?? [];
    expect(parts).toContain('selector');
    expect(parts).not.toContain('text-input');
    expect(parts).not.toContain('text-area');
    expect(JSON.stringify(r.data)).not.toMatch(
      /Unknown prop variant on text-input/,
    );
  }, 300_000);
});
