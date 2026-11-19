// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Two settings that reach one element through two parts drawn on it (a
 * dialog shadow that reaches the popover, a menu shadow that reaches the
 * selector popup drawn on that popover) are named when the second one is
 * set: the build's order alone decides which shows there, so the result
 * says so, with the line that gives the other part the new look as well.
 * Against a real bundled base theme.
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
  cwd = makeLinkedFixture('astryx-theme-two-looks-', FIXTURE_PACKAGES);
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

describe('a dialog shadow and a menu shadow', () => {
  it('names where they meet on the selector popup', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('b', {cwd, like: 'neutral'});
    await themeEditSet('b', 'box-shadow', '0 3px 7px rgba(0, 0, 0, 0.3)', {
      cwd,
      on: 'dialog',
    });
    const r = /** @type {any} */ (
      await themeEditSet('b', 'box-shadow', '0 2px 4px rgba(0, 0, 0, 0.2)', {
        cwd,
        on: 'menus',
      })
    );
    expect(r.data.notes.join('\n')).toMatch(
      /box-shadow on menus and box-shadow = 0 3px 7px [^\n]* on dialog meet on one element: popover/,
    );
  }, 240_000);
});
