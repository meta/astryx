// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A part drawn under an invisible native input (a checkbox's or radio's
 * box, a switch) never takes the pointer or the focus: the part data
 * records it, and set refuses those states there. Against real bundled
 * base themes.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-under-input-', FIXTURE_PACKAGES);
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

describe('a part under an input', () => {
  it('refuses a pointer or focus state there, never on a menu item', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('u', {cwd, like: 'neutral'});
    for (const [on, state] of [
      ['checkbox-indicator', 'hover'],
      ['radio-indicator', 'hover'],
      ['radio-indicator', 'focus-within'],
      ['switch', 'hover'],
    ]) {
      const r = await refusal(() =>
        themeEditSet('u', 'background-color', '#dc2626', {
          cwd,
          on,
          state,
          ...(on === 'switch' ? {} : {only: true}),
        }),
      );
      expect(r.code, `${on} ${state}`).toBe('ERR_THEME_NO_EFFECT');
      expect(r.message, `${on} ${state}`).toMatch(/invisible input/);
    }
    // (A part with no input over it keeps its hover.)
    await themeEditSet('u', 'background-color', '#dc2626', {
      cwd,
      on: 'dropdown-menu-item',
      state: 'hover',
    });
    // (A state that is no pointer or focus still works on the box.)
    await themeEditSet('u', 'background-color', '#dc2626', {
      cwd,
      on: 'checkbox-indicator',
      state: 'checked',
      only: true,
    });
  }, 240_000);
});
