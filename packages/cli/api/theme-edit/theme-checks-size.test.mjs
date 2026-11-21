// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A checkbox's box and a radio's circle read no spacing or control size:
 * a size word on them ("bigger checkboxes", "smaller radios") is refused with
 * the padding line, as main reads it, and a switch's track is left to its
 * thumb. Against a real bundled base theme.
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
  cwd = makeLinkedFixture('astryx-theme-checks-size-', FIXTURE_PACKAGES);
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

/** The first answer's set lines. @param {string} q @param {string} theme */
const lines = async (q, theme) => {
  const {data} = await themeEditHow(q, {cwd, theme});
  return ((data.results ?? [])[0]?.commands ?? [])
    .filter((/** @type {string} */ c) => / editor set /.test(c))
    .map((/** @type {string} */ c) => c.replace(/^.*? editor /, ''));
};

describe('the size of checkboxes and radios', () => {
  // (As main reads it: the box takes no spacing, so a size word is refused
  // with the padding line, never a width and height the editor works out.)
  it('a size word on the box writes no width or height of its own', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('t', {cwd, like: 'neutral'});
    for (const ask of ['bigger checkboxes', 'smaller radios']) {
      const {data} = await themeEditHow(ask, {cwd, theme: 't'});
      const all = JSON.stringify(data.results);
      expect(all, ask).not.toMatch(/(?:width|height) \d+px --on/);
      expect(all, ask).toMatch(/padding 8px --on (?:checkbox|radio)-indicator/);
    }
  });

  it('leaves the switch, whose track Core lays out with its thumb', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('w', {cwd, like: 'neutral'});
    expect(await lines('bigger switches', 'w')).not.toContainEqual(
      expect.stringMatching(/ (width|height) \d+px --on switch/),
    );
  });
});
