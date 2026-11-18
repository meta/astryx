// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A role color too dark to stand out on the dark page keeps the
 * documented dark fill (shade 70), and the set result offers the shade
 * nearest it that passes as a one-line dark-mode choice; `how` for a deeper
 * accent includes that dark line, so dark mode goes deeper too instead of
 * paler.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
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

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-deeper-accent-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
  await themeEditNew('deep', {
    cwd,
    like: 'neutral',
    settings: {accent: '#3b82f6', neutral: '#64748b'},
  });
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('a deeper accent in dark mode', () => {
  it('how for a deeper blue accent sets the dark accent to a deep color that stands out, in the same line', async () => {
    const {data} = /** @type {any} */ (
      await themeEditHow('deeper blue accent', {cwd, theme: 'deep'})
    );
    const [first, second] = /** @type {string[]} */ (
      data.results?.[0]?.commands ?? []
    );
    expect(data.results?.[0]?.sequence).toBe(true);
    expect(first).toMatch(/set deep accent '#[0-9a-f]{6}'$/);
    expect(second).toMatch(
      /set deep --color-accent '#[0-9a-f]{6}' --mode dark$/,
    );
  }, 120_000);

  it('set keeps shade 70 in dark and offers the nearest passing shade as one line', async () => {
    const {data} = /** @type {any} */ (
      await themeEditSet('deep', 'accent', '#2563eb', {cwd})
    );
    expect(/** @type {string[]} */ (data.notes).join('\n')).toMatch(
      /in dark, --color-accent is shade 70, not your exact color: .*; for a fill closer to your color in dark: .* set deep --color-accent '#[0-9a-f]{6}' --mode dark \(shade \d+, the nearest that passes, with white text at [\d.]+:1\)/,
    );
  }, 120_000);
});
