// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A part drawn under an invisible native input (a checkbox's or radio's
 * box, a switch) never takes the pointer or the focus: the part data
 * records it, and set writes those states as the part holding the input
 * shows them. Against real bundled base themes.
 */

import fs from 'node:fs';
import path from 'node:path';
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
  it('takes a pointer or focus state there from the part holding the input', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('u', {cwd, like: 'neutral'});
    for (const [on, state] of [
      ['checkbox-indicator', 'hover'],
      ['radio-indicator', 'hover'],
      ['radio-indicator', 'focus-within'],
      ['switch', 'hover'],
    ])
      await themeEditSet('u', 'background-color', '#dc2626', {
        cwd,
        on,
        state,
        ...(on === 'switch' ? {} : {only: true}),
      });
    const css = fs.readFileSync(path.join(cwd, 'themes', 'u', 'u.css'), 'utf8');
    expect(css).toMatch(
      /\.astryx-checkbox-indicator:where\(\.astryx-checkbox-input:hover \*\)/,
    );
    expect(css).toMatch(
      /\.astryx-radio-indicator:where\(\.astryx-[\w-]+:focus-within \*\)/,
    );
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
