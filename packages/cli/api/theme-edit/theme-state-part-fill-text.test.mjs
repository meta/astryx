// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * element and state reads: a part's own fill, the text beside a
 * part, a possessive's two-word element, an unknown word before a piece,
 * a second state a part lacks. Against real bundled base themes.
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
    'astryx-theme-state-part-fill-text-',
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

describe('reads', () => {
  it('reads each element where the words put it', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('f', {cwd, like: 'neutral'});
    // A card paints its own fill: never a part inside it.
    const fill = await answer('make the badge text match the card fill', 'f');
    expect(fill.parts).not.toContain('checkbox-input');
    // The text after a checkbox is its label.
    expect(
      (await answer('make the text after the checkbox bold', 'f')).writes,
    ).toEqual(['set f font-weight 700 --on checkbox-label']);
    // A possessive's two-word element.
    expect(
      (await answer("make the table's header cells bold", 'f')).writes,
    ).toEqual(['set f font-weight 700 --on table-header-cell']);
    // An unknown word before a piece is said, nothing written.
    const zorp = await answer('make the card zorp title bigger', 'f');
    expect(zorp.writes).toEqual([]);
    expect(zorp.text).toMatch(/zorp/);
    // The inputs in a dialog are the inputs, never a command palette's.
    const inputs = await answer('make the inputs in dialogs taller', 'f');
    expect(inputs.parts).not.toContain('command-palette-input');
    // The separators of menus are the menu's own divider.
    expect(
      (await answer('make the separators of menus red', 'f')).writes,
    ).toEqual(["set f --color-border '#dc2626' --on dropdown-menu-divider"]);
    // A card's headings are its title: kept to the card.
    for (const c of (await answer('make the card headings bigger', 'f')).writes)
      expect(c).toMatch(/ --on card$/);
    // A second state the part lacks is said.
    const two = await answer(
      'make the selected and hovered menu items blue',
      'f',
    );
    expect(two.writes).toEqual([]);
    expect(two.text).toMatch(/has no selected state/);
  }, 240_000);
});
