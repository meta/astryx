// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Words a clone ask uses: table headers are the header cells, menus said
 * plainly are every menu, a tab's underline asked for a color and a
 * thickness is its indicator's fill and height. Against real bundled base
 * themes.
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
  cwd = makeLinkedFixture(
    'astryx-theme-words-uses-table-headers-',
    FIXTURE_PACKAGES,
  );
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

describe('clone words', () => {
  it('reads each as the part Core draws', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('k', {cwd, like: 'neutral'});
    // Table headers (plural) are the header cells, never every row.
    for (const w of (await answer('table headers uppercase', 'k')).writes)
      expect(w).toMatch(/ --on table-header-cell$/);
    // Menus said plainly are the menus group.
    const menus = await answer('make the menus red', 'k');
    expect(menus.parts).toContain('menus');
    // A tab's 2px black underline is its indicator's fill and height.
    const tab = await answer(
      'tabs with a 2px black underline when selected',
      'k',
    );
    expect(tab.writes.join('\n')).not.toMatch(/text-decoration/);
    expect(tab.writes.join('\n')).toMatch(
      /background-color '#000000' --on tab-indicator/,
    );
    expect(tab.writes.join('\n')).toMatch(
      /(?:min-)?height 2px --on tab-indicator/,
    );
  }, 240_000);
});
