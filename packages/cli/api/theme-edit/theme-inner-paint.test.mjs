// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A paint an element inside a part draws from a token (a keyboard key's
 * chip, a list item's label text): set never takes the property on the
 * part, which that element paints over, and offers the token. Against real
 * bundled base themes.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-inner-paint-', FIXTURE_PACKAGES);
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

/** @param {string} q @param {string} theme */
const answer = async (q, theme) => {
  const {data} = await themeEditHow(q, {cwd, theme});
  return {
    parts: data.understood?.parts ?? [],
    writes: (data.results ?? [])
      .flatMap((/** @type {any} */ r) => r.commands)
      .filter((/** @type {string} */ c) => / editor set /.test(c))
      .map((/** @type {string} */ c) => c.replace(/^.*? editor /, '')),
    text: (data.results ?? []).map((/** @type {any} */ r) => r.text).join('\n'),
  };
};

describe('a paint drawn inside a part', () => {
  it('refuses the property on the part and offers the token', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('i', {cwd, like: 'neutral'});
    const kbd = await refusal(() =>
      themeEditSet('i', 'background-color', '#888888', {cwd, on: 'kbd'}),
    );
    expect(kbd.code).toBe('ERR_THEME_NO_EFFECT');
    expect(kbd.run[0]).toMatch(/ set i --color-neutral '#888888' --on kbd$/);
    const item = await refusal(() =>
      themeEditSet('i', 'color', '#ff0000', {cwd, on: 'radio-list-item'}),
    );
    expect(item.code).toBe('ERR_THEME_NO_EFFECT');
    expect(item.run[0]).toMatch(
      /--color-text-primary '#ff0000' --on radio-list-item$/,
    );
    // (A part that paints its own fill keeps the property.)
    await themeEditSet('i', 'background-color', '#888888', {cwd, on: 'card'});
    // The words for a keyboard key read Kbd, answered with its token.
    const keys = await answer('make the keyboard keys gray', 'i');
    expect(keys.parts).toContain('kbd');
    expect(keys.writes.join('\n')).toMatch(/--color-neutral .* --on kbd/);
    const text = await answer('make the radio list item text red', 'i');
    expect(text.writes.join('\n')).not.toMatch(
      / color '#dc2626' --on radio-list-item/,
    );
  }, 240_000);
});
