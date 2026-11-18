// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A checkbox's box and a radio's circle set their own width and height and
 * read no spacing or control size: "smaller checkboxes", "bigger radios" and
 * "13px checkboxes" size that square (Core draws the marks inside as a share
 * of it), and spacing on them is refused with the size line to use. Against
 * a real bundled base theme.
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
  it('steps each size from its own value, never spacing', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('c', {cwd, like: 'neutral'});
    // (The part data draws the md box only: sm is named, never given md's
    // size.)
    expect(await lines('smaller checkboxes', 'c')).toEqual([
      'set c width 20px --on checkbox-indicator --when size:md --only',
      'set c height 20px --on checkbox-indicator --when size:md --only',
    ]);
    const {data} = await themeEditHow('smaller checkboxes', {cwd, theme: 'c'});
    expect(data.results[0].text).toMatch(/sm: no size the editor knows/);
    expect(await lines('bigger radio buttons', 'c')).toEqual([
      'set c width 28px --on radio-indicator --when size:md --only',
      'set c height 28px --on radio-indicator --when size:md --only',
    ]);
    expect(await lines('smaller checks', 'c')).toEqual([
      'set c width 20px --on checks --when size:md',
      'set c height 20px --on checks --when size:md',
    ]);
  });

  it('steps from the theme\u2019s latest size, the part or its group', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('n', {cwd, like: 'neutral'});
    expect(await lines('13px checkboxes', 'n')).toEqual([
      'set n width 13px --on checkbox-indicator --only',
      'set n height 13px --on checkbox-indicator --only',
    ]);
    await themeEditSet('n', 'width', '20px', {
      cwd,
      on: 'checkbox-indicator',
      only: true,
    });
    await themeEditSet('n', 'height', '20px', {
      cwd,
      on: 'checkbox-indicator',
      only: true,
    });
    await themeEditSet('n', 'width', '13px', {cwd, on: 'checks'});
    await themeEditSet('n', 'height', '13px', {cwd, on: 'checks'});
    // (The group's 13px, set later, covers the part's 20px; every size.)
    expect(await lines('bigger checkboxes', 'n')).toEqual([
      'set n width 17px --on checkbox-indicator --when size:sm --only',
      'set n height 17px --on checkbox-indicator --when size:sm --only',
      'set n width 17px --on checkbox-indicator --when size:md --only',
      'set n height 17px --on checkbox-indicator --when size:md --only',
    ]);
    // The refusal names the theme's size, not Core's.
    const r = await refusal(() =>
      themeEditSet('n', 'spacing', 'less', {cwd, on: 'checks'}),
    );
    expect(r.code).toBe('ERR_THEME_NO_EFFECT');
    expect(r.message).toMatch(/\(13px by 13px\)/);
    expect(r.message).not.toMatch(/share/);
    expect(r.run.some(x => /how "smaller checks"$/.test(x))).toBe(true);
  });

  it('leaves the switch, whose track Core lays out with its thumb', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('w', {cwd, like: 'neutral'});
    expect(await lines('bigger switches', 'w')).not.toContainEqual(
      expect.stringMatching(/ (width|height) \d+px --on switch/),
    );
  });
});
