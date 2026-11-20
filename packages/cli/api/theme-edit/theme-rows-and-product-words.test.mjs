// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Rows said of a part that holds no table rows are that part's own rows
 * ("menus with 32px rows" sizes the menu items, never the table rows), and
 * a part word right before a noun the editor knows as nothing begins a
 * compound subject ("a radio station", "a card game"), which is named and
 * never written as the part. Against real bundled base themes.
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

  it('reads a part word before an unknown noun as a compound subject', async ctx => {
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

  it("reads a typed value after a part and an unknown word as the part's", async ctx => {
    if (needBases(ctx)) return;
    const kbd = await answer(
      'kbd hints #2e3035 with #8a8f98 text and 4px corners',
      's',
    );
    expect(kbd.text).not.toMatch(/no part is called/);
    expect(kbd.writes).toEqual(
      expect.arrayContaining([
        "set s background-color '#2e3035' --on kbd-key",
        "set s --color-text-primary '#8a8f98' --on kbd",
        'set s border-radius 4px --on kbd-key',
      ]),
    );
    // (Nothing is written for the whole theme.)
    expect(kbd.writes.filter(w => !/ --on /.test(w))).toEqual([]);
  }, 240_000);

  it('reads the head\'s own piece in its list as the one changed, and any other "on" as before', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('pb', {cwd, like: 'neutral'});
    const fill = (
      await answer('progress bars: white fill on a dark track', 'pb')
    ).writes.join('\n');
    expect(fill).toMatch(/background-color '#ffffff' --on progress-bar-fill/);
    expect(fill).not.toMatch(/--on progress-bar-track/);
    // (The fill said as the bar's "indicator" is the fill too, never the
    // checkboxes' indicators.)
    for (const ask of [
      'progress bars: white indicator on a dark track',
      'progress bars: white indicators',
      'progress bars: white progress indicator on a dark track',
    ]) {
      const lines = (await answer(ask, 'pb')).writes.join('\n');
      expect(lines, ask).toMatch(
        /background-color '#ffffff' --on progress-bar-fill/,
      );
      expect(lines, ask).not.toMatch(/--on (?:checks|progress-bar-track)\b/);
    }
    // (A determiner before the head is the same head.)
    expect(
      (
        await answer('the progress bars: white fill on a dark track', 'pb')
      ).writes.join('\n'),
    ).toMatch(/--on progress-bar-fill/);
    // (An item that names a part of its own keeps it; a piece the head
    // lacks is never the head.)
    for (const [ask, line] of [
      [
        'progress bar: gray progress bar track',
        "background-color 'light-dark(#9e9e9e, #525252)' --on progress-bar-track",
      ],
      [
        'dropdown menu: white menu items',
        "background-color '#ffffff' --on dropdown-menu-item --when variant:default --mode light",
      ],
      [
        'side nav: white side nav items',
        "background-color '#ffffff' --on side-nav-item --mode light",
      ],
      ['cards: blue icons', "--color-icon-primary '#2563eb'"],
      // (A word that already names a group holding the head keeps it.)
      ['checkboxes: 8px tall indicator', 'min-height 8px --on checks'],
    ])
      expect((await answer(ask, 'pb')).writes, ask).toContain(`set pb ${line}`);
    // (An element named after "on" is still that element.)
    for (const [ask, line] of [
      [
        'dropdown menu: blue background on the selected item',
        "background-color '#2563eb' --on dropdown-menu-radio --state checked",
      ],
      [
        'selects: blue background on the selected option',
        "background-color '#2563eb' --on selector-option-row --state selected",
      ],
      [
        'menus: gray background on the hovered item',
        "background-color '#9e9e9e' --on dropdown-menu-item --state hover",
      ],
    ])
      expect((await answer(ask, 'pb')).writes, ask).toContain(`set pb ${line}`);
    // ("loading bars" said in the plural names no part, as on main.)
    expect((await answer('loading bars track #e5e7eb', 'pb')).writes).toEqual(
      [],
    );
  }, 240_000);

  it.each([
    // [ask, the parts read, a compound named, if any]
    ['make the radio buttons bold', ['radio-indicator'], null],
    ['make the button text bigger', ['button'], null],
    ['make the card border red', ['card'], null],
    ['make the links turn red', ['link'], null],
    ['make the radio station blue', [], 'radio station'],
    ['make the button factory green', [], 'button factory'],
    // (A compound that describes the product before a colon names
    // nothing: the look after it is the whole theme's.)
    ['radio station app: rounder corners', [], null],
    ['button factory app: rounder corners', [], null],
    ['card game app: rounded corners', [], null],
    // (A part with one unknown word after it, and nothing more, keeps the
    // part: the word is no compound's noun.)
    ['buttons chunky', ['button'], null],
    ['header sticky', ['app-shell-header'], null],
    // (A part word said in the plural is that part's whole name, as main
    // reads it: "progress bars" is the bar's fill, never its track.)
    ['progress bars white', ['progress-bar-fill'], null],
  ])('%s', async (ask, parts, compound) => {
    // (The bundled theme the cases above made; skipped with them.)
    if (unbuilt) return;
    const {data} = await themeEditHow(ask, {cwd, theme: 's'});
    expect(data.understood?.parts ?? []).toEqual(parts);
    const text = (data.results ?? [])
      .map((/** @type {any} */ r) => r.text)
      .join('\n');
    const writes = (data.results ?? [])
      .flatMap((/** @type {any} */ r) => r.commands)
      .filter((/** @type {string} */ c) => / editor set /.test(c));
    if (compound) {
      expect(text).toContain(`no part is called "${compound}"`);
      expect(writes).toEqual([]);
    } else if (ask.split(' ').length > 2)
      expect(writes.length).toBeGreaterThan(0);
    else expect(text).not.toMatch(/no part is called/);
  });
});
