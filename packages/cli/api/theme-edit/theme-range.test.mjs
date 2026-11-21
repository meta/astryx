// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * The part data draws a calendar in range mode with a range of days chosen,
 * so the band Core paints behind the days in the range is read and can be
 * set. Against real bundled base themes.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-range-', FIXTURE_PACKAGES);
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

describe('a calendar range', () => {
  it('its band is the calendar-range part, set with its own fill', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('r', {cwd, like: 'neutral'});
    await themeEditSet('r', '--color-accent-muted', '#bfdbfe', {
      cwd,
      on: 'calendar',
    });
    const band = await answer('make the calendar range band blue', 'r');
    expect(band.parts).toEqual(['calendar-range']);
    expect(band.writes.join('\n')).toMatch(
      /background-color '#[0-9a-f]{6}' --on calendar-range$/,
    );
  }, 240_000);
});

describe('a list inside an overlay', () => {
  it("its shadow is the overlay's: pointed to, never written", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('o', {cwd, like: 'neutral'});
    for (const q of [
      'give the typeahead dropdown a bigger shadow',
      'make the shadow of the typeahead dropdown bigger',
    ]) {
      const r = await answer(q, 'o');
      expect(r.writes, q).toEqual([]);
      expect(r.text, q).toMatch(
        /the popover it opens in draws it.*every popover/,
      );
    }
  }, 240_000);
});
