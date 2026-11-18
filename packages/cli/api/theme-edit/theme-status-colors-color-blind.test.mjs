// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Status fills that someone red-weak or green-weak may not tell apart are
 * noted with a line that sets one of them apart, and how answers a
 * color-blind question.
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
  cwd = makeLinkedFixture('astryx-theme-cvd-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('status colors for color-blind readers', () => {
  it('notes two status fills that may look alike, with a line that sets one apart', async () => {
    await themeEditNew('cb', {cwd, like: 'neutral'});
    await themeEditSet('cb', 'success', '#357d2b', {cwd});
    const r = /** @type {any} */ (
      await themeEditSet('cb', 'warning', '#8a6d00', {cwd})
    );
    const note = /** @type {string[]} */ (r.data.notes).find(n =>
      /^for color-blind readers, the success and warning fills may look alike/.test(
        n,
      ),
    );
    // (The line it offers keeps the moved fill standing out from the page:
    // set, it asks for no darker one.)
    const line = /set cb (\w+) '(#[0-9a-f]{6})'$/.exec(String(note));
    expect(line).not.toBeNull();
    const after = /** @type {any} */ (
      await themeEditSet('cb', String(line?.[1]), String(line?.[2]), {cwd})
    );
    expect(JSON.stringify(after.data.newProblems ?? [])).not.toMatch(
      /stands out from the page/,
    );
  }, 240_000);

  it('how answers a color-blind question', async () => {
    const r = /** @type {any} */ (
      await themeEditHow('are the statuses color-blind safe?', {
        cwd,
        theme: 'cb',
      })
    );
    expect(JSON.stringify(r.data)).toMatch(/color-blind readers/);
  }, 240_000);
});
