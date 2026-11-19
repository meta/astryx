// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * The overlays group holds a menu's floating box (a dropdown menu: the
 * popover fill under a shared shadow), so a look on overlays reaches menus
 * too. Against a real bundled base theme.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {context} from './_context.mjs';
import {groupsOf} from './_settings.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-overlays-menus-', FIXTURE_PACKAGES);
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

describe('the overlays group', () => {
  it("the overlays group holds a dropdown menu's box", async ctx => {
    if (needBases(ctx)) return;
    expect(groupsOf(await context(cwd)).overlays).toEqual(
      expect.arrayContaining(['dropdown-menu', 'popover']),
    );
  }, 240_000);
});
