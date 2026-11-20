// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A panel's look written for every one reaches the panels an app places in
 * a layout too (cards in a carousel, a grid or a stack): the answer says so
 * once, with the place to ask for. Against real bundled base themes.
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
  cwd = makeLinkedFixture('astryx-theme-tiles-', FIXTURE_PACKAGES);
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

describe('cards as tiles', () => {
  it('a card look says the cards in a layout take it too', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('t', {cwd, like: 'neutral'});
    const r = await answer('make cards have a 2px black border', 't');
    expect(r.writes.length).toBeGreaterThan(0);
    expect(r.text).toMatch(/cards placed in .*carousel.* take this too/);
    // (No card write, no note.)
    const b = await answer('make buttons red', 't');
    expect(b.text).not.toMatch(/placed in/);
  }, 240_000);
});
