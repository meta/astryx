// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A token the base theme points at another one on a part (neutral's
 * progress track reads the muted fill, which it points at the emphasized
 * border) is named as what the part shows, and a border that the
 * emphasized border follows says those parts move with it.
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
  cwd = makeLinkedFixture('astryx-theme-d-track-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
  await themeEditNew('t', {cwd, like: 'neutral'});
  await themeEditSet('t', 'mode', 'light-only', {cwd});
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('a track the base theme draws from the emphasized border', () => {
  it('is named as what the part shows', async () => {
    const {data} = /** @type {any} */ (
      await themeEditHow('switch', {cwd, theme: 't'})
    );
    const fill = data.reads.background.find(
      (/** @type {any} */ r) => r.token === '--color-background-gray',
    );
    expect(fill.shows).toMatch(
      /^--color-border-emphasized \(the neutral theme points --color-background-gray at it on switch\)$/,
    );
  });

  it('moves with a border the emphasized border follows, and the result says so', async () => {
    const {data} = /** @type {any} */ (
      await themeEditSet('t', '--color-border', '#000000', {cwd})
    );
    const line = data.notes.find((/** @type {string} */ n) =>
      /follows it/.test(n),
    );
    expect(line).toMatch(/the parts the base theme draws from it: .*switch/);
  });
});
