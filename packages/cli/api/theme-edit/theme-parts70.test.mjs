// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * An element of a part named before "in" or "of" that part (the selected
 * option row in the selector): that part's own element, never another
 * component the words seem to name, and the place is where, not what.
 * Against real bundled base themes.
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
  cwd = makeLinkedFixture('astryx-theme-parts70-', FIXTURE_PACKAGES);
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

/** The first answer's commands, bare. @param {string} q @param {string} theme */
const top = async (q, theme) => {
  const {data} = await themeEditHow(q, {cwd, theme});
  const r = (data.results ?? []).find(x =>
    x.commands.some(c => / editor (set|undo) /.test(c)),
  );
  return {
    text: (data.results ?? []).map(x => x.text).join('\n'),
    commands: (r?.commands ?? []).map(c => c.replace(/^.*? editor /, '')),
  };
};

describe('an element of a part named in that part', () => {
  it("is the part's own element by the rest of its catalog name, in the state said", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('e', {cwd, like: 'neutral'});
    expect(
      (await top('make the selected option row in the selector bold', 'e'))
        .commands,
    ).toEqual([
      'set e font-weight 700 --on selector-option-row --state selected',
    ]);
    expect(
      (await top('make the hovered option in the selector red', 'e')).commands,
    ).toEqual([
      "set e background-color '#dc2626' --on selector-option --state hover",
    ]);
  }, 240_000);

  it('takes the element of that name that has the state said', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('k', {cwd, like: 'neutral'});
    expect(
      (await top('make the checked item in the dropdown menu bold', 'k'))
        .commands,
    ).toEqual([
      'set k font-weight 700 --on dropdown-menu-radio --state checked',
    ]);
  }, 240_000);

  it('never writes the place after "of" as a part of its own', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('o', {cwd, like: 'neutral'});
    expect(
      (
        await top(
          'make the text in the hovered menu item of the dropdown red',
          'o',
        )
      ).commands,
    ).toEqual(["set o color '#dc2626' --on dropdown-menu-item --state hover"]);
  }, 240_000);
});
