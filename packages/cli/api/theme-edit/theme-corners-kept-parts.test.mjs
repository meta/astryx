// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Whole-theme corners name the parts the theme gives corners of their own
 * as kept, with the undo lines that hand them back to the dial. Against
 * real bundled base themes.
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

/** Why a bundled theme could not be built here, when it could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-corners-kept-parts-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
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

describe('whole-theme corners', () => {
  it('name the parts with corners of their own as kept, with undo lines', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('k', {cwd, like: 'neutral'});
    await themeEditSet('k', 'border-radius', '12px', {cwd, on: 'dialog'});
    await themeEditSet('k', 'border-radius', '12px', {cwd, on: 'menus'});
    const {data} = await themeEditSet('k', 'corners', 'square', {cwd});
    const kept = (data.leftOut ?? []).find((/** @type {any} */ x) =>
      /own corners/.test(x.note),
    );
    expect(kept?.note).toMatch(/^dialog, menus keep their own corners/);
    expect(kept?.run).toEqual([
      expect.stringMatching(/ undo k border-radius --on dialog$/),
      expect.stringMatching(/ undo k border-radius --on menus$/),
    ]);
    // (A theme with no part corners of its own names none.)
    await themeEditNew('n', {cwd, like: 'neutral'});
    const plain = await themeEditSet('n', 'corners', 'round', {cwd});
    expect(
      (plain.data.leftOut ?? []).some((/** @type {any} */ x) =>
        /own corners/.test(x.note),
      ),
    ).toBe(false);
  }, 240_000);
});
