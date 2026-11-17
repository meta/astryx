// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Navigation and heading asks reach what they name: "side navigation" and
 * "top navigation" are those parts, a selection said of a part is its
 * selected items, a role word right before a written color names that
 * color, a color and its part said after another color and part is an item
 * of its own, a top bar's text reaches the component Core's docs call a top
 * bar, and a heading's text color reaches every part drawn as a heading
 * element. Against real bundled base themes.
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
    'astryx-theme-navigation-and-headings-reach-',
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
    // (The first answer, the one to run.)
    writes: (data.results?.[0]?.commands ?? [])
      .filter((/** @type {string} */ c) => / editor set /.test(c))
      .map((/** @type {string} */ c) => c.replace(/^.*? editor /, '')),
    text: (data.results ?? []).map((/** @type {any} */ r) => r.text).join('\n'),
  };
};

describe('navigation and headings', () => {
  it('reads the navigation words, the selection and the brand color written', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('n', {cwd, like: 'neutral'});
    expect((await answer('dark side navigation', 'n')).parts).toEqual([
      'side-nav',
    ]);
    expect((await answer('make the top navigation dark', 'n')).parts).toEqual([
      'top-nav',
    ]);
    const sel = await answer('white sidebar blue selection', 'n');
    expect(sel.writes).toEqual([
      "set n background-color '#ffffff' --on side-nav --mode light",
      "set n background-color '#2563eb' --on side-nav-item --state selected",
    ]);
    const brand = await answer(
      'Give the top bar our brand color #1E3A8A with white text.',
      'n',
    );
    // (The text reaches the top nav too, which Core's docs call a top bar.)
    expect(brand.writes).toEqual([
      "set n background-color '#1e3a8a' --on app-shell-header",
      "set n --color-text-primary '#ffffff' --on app-shell-header",
      "set n --color-text-secondary '#ffffff' --on app-shell-header",
      "set n --color-text-primary '#ffffff' --on top-nav",
      "set n --color-text-secondary '#ffffff' --on top-nav",
    ]);
    // (A role word alone is still the role's color.)
    expect((await answer('make the header brand color', 'n')).writes).toEqual([
      "set n background-color 'var(--color-accent)' --on app-shell-header",
    ]);
  }, 240_000);

  it("reaches every heading element with a heading's text color", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('h', {cwd, like: 'neutral'});
    const r = await answer('Just the headings: color them #7C2D12.', 'h');
    expect(r.writes.slice(0, 3)).toEqual([
      "set h color '#7c2d12' --on heading",
      "set h color '#7c2d12' --on empty-state-title",
      "set h color '#7c2d12' --on markdown-heading",
    ]);
    // (One heading level is that level alone.)
    // (Beside an except, the heading is the heading alone.)
    expect(
      (await answer('make all headings red except h1', 'h')).writes[0],
    ).toBe("set h color '#dc2626' --on heading");
    expect((await answer('make the h2 red', 'h')).writes).toEqual([
      "set h color '#dc2626' --on heading --when level:2",
    ]);
  }, 240_000);
});
