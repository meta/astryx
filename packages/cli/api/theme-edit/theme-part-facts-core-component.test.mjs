// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Part facts read from Core: a part another component places somewhere
 * (the current page's button in a pagination, a pressed toggle) records
 * that place as a condition, so what that component paints it with there is
 * never read as the part's look at rest. Against real bundled base themes.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew} from './theme-edit.mjs';
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

/** Why a bundled theme could not be built here, when it could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-part-facts-core-component-',
    FIXTURE_PACKAGES,
  );
  unbuilt = await installRealBaseThemes(cwd, ['neutral', 'butter']);
}, 300_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {import('vitest').TestContext} ctx */
const needBases = ctx => {
  if (!unbuilt) return false;
  console.warn(`skipped: ${unbuilt}`);
  ctx.skip();
  return true;
};

describe("a part in another component's place", () => {
  it("never reads a pagination's current-page fill as a ghost button's rest fill", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('n', {cwd, like: 'neutral'});
    const {data} = await themeEditHow('button', {cwd, theme: 'n'});
    const reads = /** @type {Array<{token: string, when: string[]}>} */ (
      data.reads.background
    );
    const at = (/** @type {string} */ token) =>
      reads.find(r => r.token === token)?.when ?? [];
    // Core paints a ghost button transparent at rest.
    expect(at('--color-neutral')).not.toContain('--when variant:ghost');
    expect(at('--color-overlay-pressed')).not.toContain('--when variant:ghost');
    expect(at('--color-neutral')).toContain('--when variant:secondary');
    // The current page's fill is its pagination cell's, in a state set names.
    const cell = await themeEditHow('pagination-item', {cwd, theme: 'n'});
    const cellReads = /** @type {Array<{token: string, when: string[]}>} */ (
      cell.data.reads.background
    );
    expect(
      cellReads.find(r => r.token === '--color-neutral')?.when ?? [],
    ).toContain('--state selected');
  }, 240_000);
});
