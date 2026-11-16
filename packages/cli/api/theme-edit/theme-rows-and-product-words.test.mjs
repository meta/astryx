// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Rows said of a part that holds no table rows are that part's own rows
 * ("menus with 32px rows" sizes the menu items, never the table rows), and
 * a part word that names what a product is about ("a radio station site")
 * names no part. Against real bundled base themes.
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
  cwd = makeLinkedFixture(
    'astryx-theme-rows-and-product-words-',
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

describe("a part's rows and a product's words", () => {
  it('reads rows as the rows of the part named', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('r', {cwd, like: 'neutral'});
    const menus = await answer('menus with 32px rows', 'r');
    expect(menus.parts).toContain('dropdown-menu-item');
    expect(menus.parts).not.toContain('table-row');
    expect(menus.writes.join('\n')).not.toMatch(/--on table-row/);
    // (Rows alone, or a table's, are still the table's.)
    expect((await answer('make the table rows 40px tall', 'r')).parts).toEqual([
      'table-row',
    ]);
  }, 240_000);

  it('names no part with the words a product is about', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('s', {cwd, like: 'neutral'});
    const site = await answer(
      'podcast and radio station site: heavy headings, accent #c2410c, cream page',
      's',
    );
    expect(site.parts).not.toContain('radio-indicator');
    expect(site.writes.join('\n')).not.toMatch(/radio-indicator/);
    // (The part named as a part is still that part.)
    expect((await answer('make the radio buttons bold', 's')).parts).toEqual([
      'radio-indicator',
    ]);
  }, 240_000);
});
