// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A color set on a part names an earlier text color token set on a part
 * around it that the color now covers: a dialog header's title block set
 * to white text, then a dark color on every heading, says the heading in
 * the title block shows the dark color, with the line that takes it back.
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
  cwd = makeLinkedFixture('astryx-theme-color-covers-', FIXTURE_PACKAGES);
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

describe('a color over a text token set around the part', () => {
  it('names the covered setting and the line that takes the color back', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('h', {cwd, like: 'neutral'});
    await themeEditSet('h', '--color-text-primary', '#ffffff', {
      cwd,
      on: 'dialog-header-title-block',
    });
    const r = /** @type {any} */ (
      await themeEditSet('h', 'color', '#333333', {cwd, on: 'heading'})
    );
    const notes = r.data.notes.join('\n');
    expect(notes).toMatch(
      /color on heading covers --color-text-primary = #ffffff on dialog-header-title-block/,
    );
    expect(notes).toContain('undo h color --on heading');
  }, 240_000);
});
