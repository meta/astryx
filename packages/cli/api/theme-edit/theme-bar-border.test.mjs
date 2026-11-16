// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A border asked of a bar is the bar's own, unless its edges are pieces
 * that draw borders of their own: a top nav's bottom border goes on the top
 * nav, never under each of its rounded items; a date and time field's
 * border still goes on its two boxes; a sidebar's right border is the
 * sidebar's, never one beside each link. Against real bundled base themes.
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
  cwd = makeLinkedFixture('astryx-theme-bar-border-', FIXTURE_PACKAGES);
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

describe('a border on a bar', () => {
  it('goes on the bar, unless its pieces draw the borders', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('b', {cwd, like: 'neutral'});
    expect(
      (await answer('top nav with a 1px bottom border', 'b')).writes,
    ).toEqual([
      "set b border-bottom '1px solid var(--color-border)' --on top-nav",
    ]);
    expect(
      (await answer('sidebar with a 1px right border', 'b')).writes,
    ).toEqual([
      "set b border-right '1px solid var(--color-border)' --on side-nav",
    ]);
    // (Its items, named, are still its items.)
    expect(
      (await answer('nav items with a bottom border', 'b')).writes[0],
    ).toMatch(/--on top-nav-item$/);
    // (A part whose pieces draw its border hands it to them.)
    const field = await answer('date time input with a red border', 'b');
    expect(field.parts).toEqual([
      'date-time-input-date-segment',
      'date-time-input-time-segment',
    ]);
  }, 240_000);
});
