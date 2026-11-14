// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * The contrast check reads every color stop of a gradient background (and
 * names an image as not checked), and `how` reads a side nav's section
 * headings as its sections and says what a part is. Against real bundled
 * base themes.
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
  cwd = makeLinkedFixture('astryx-theme-parts54-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral', 'butter']);
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

describe('text on a gradient', () => {
  it('is measured at each color stop, the worst counting', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('r', {cwd, like: 'neutral'});
    const r = await themeEditSet(
      'r',
      'background',
      'linear-gradient(180deg, #0a58e8 0%, #3a93ff 8%, #0a58e8 100%)',
      {cwd, on: 'app-shell-header'},
    );
    const problems = /** @type {string[]} */ (r.data.problems ?? []).join('\n');
    expect(problems).toMatch(
      /text in top-nav-item .* on app-shell-header's #[0-9a-f]{6}, a stop of its gradient/,
    );
    expect(problems).not.toMatch(/not checked/);
  }, 240_000);

  it('names a background with an image as not checked', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('i', {cwd, like: 'neutral'});
    const r = await themeEditSet(
      'i',
      'background',
      'url(x.png), linear-gradient(180deg, #0a58e8, #3a93ff)',
      {cwd, on: 'app-shell-header'},
    );
    expect(/** @type {string[]} */ (r.data.notes ?? []).join('\n')).toMatch(
      /not checked: text on or in url\(x\.png\)/,
    );
  }, 240_000);
});

describe('side nav headings', () => {
  it('reads section headings as the sections, saying their items take it too', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('s', {cwd, like: 'neutral'});
    const {data} = await themeEditHow(
      'small all-caps letter-spaced sidebar section headings',
      {cwd, theme: 's'},
    );
    expect(data.understood.parts).toEqual(['side-nav-section']);
    const text = (data.results ?? [])
      .map((/** @type {any} */ x) => x.text)
      .join('\n');
    expect(text).toMatch(
      /text-transform is inherited, so it also reaches side-nav-item/,
    );
    const heading = (await themeEditHow('side-nav-heading', {cwd, theme: 's'}))
      .data;
    expect(heading.is).toMatch(/account heading/);
  }, 240_000);
});
