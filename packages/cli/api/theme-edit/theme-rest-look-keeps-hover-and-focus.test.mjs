// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A setting that changes a part's resting look keeps the part's hover
 * and keyboard focus visible. A resting background shorthand also resets the
 * background image, where Core draws the hover and press answers: those
 * states get Core's image back. A resting
 * outline (none, or the theme's own) gives the part's focus state Core's
 * focus outline back, for each variant that draws one. A state the theme
 * sets itself keeps what it set. Against real bundled base themes.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-rest-color-hover-', FIXTURE_PACKAGES);
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

/** @param {string} slug */
const cssOf = slug =>
  fs.readFileSync(path.join(cwd, 'themes', slug, `${slug}.css`), 'utf8');

/** The declarations of a rule, by its exact selector. @param {string} css @param {string} sel */
const ruleOf = (css, sel) =>
  new RegExp(
    `(?:^|\\n)\\s*${sel.replace(/[.[\]="()]/g, m => `\\${m}`)}\\s*\\{([^}]*)\\}`,
  ).exec(css)?.[1] ?? '';

describe('a resting outline', () => {
  it('gives the focus state Core draws its focus outline back', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('o', {cwd, like: 'neutral'});
    await themeEditSet('o', 'outline', 'none', {cwd, on: 'button', only: true});
    const css = cssOf('o');
    expect(ruleOf(css, '.astryx-button')).toMatch(/outline: none;/);
    const focus = ruleOf(css, '.astryx-button:focus-visible');
    expect(focus).toMatch(/outline-style: var\(--focus-outline-style\);/);
    expect(focus).toMatch(/outline-width: var\(--focus-outline-width\);/);
    // A variant whose focus has its own color keeps it.
    expect(
      ruleOf(css, '.astryx-button[data-variant="destructive"]:focus-visible'),
    ).toMatch(/outline-color: var\(--color-error\);/);
  }, 240_000);

  it('leaves a focus outline the theme sets itself', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('f', {cwd, like: 'neutral'});
    await themeEditSet('f', 'outline', '2px dotted #000000', {
      cwd,
      on: 'tab',
      state: 'focus-visible',
    });
    await themeEditSet('f', 'outline', 'none', {cwd, on: 'tab'});
    expect(ruleOf(cssOf('f'), '.astryx-tab:focus-visible')).toMatch(
      /outline: 2px dotted #000000;/,
    );
    expect(ruleOf(cssOf('f'), '.astryx-tab:focus-visible')).not.toMatch(
      /outline-style:/,
    );
  }, 240_000);
});

describe('a resting background shorthand', () => {
  it("gives a ghost button's hover and press Core's layer back", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('g', {cwd, like: 'neutral'});
    await themeEditSet('g', 'background', 'transparent', {
      cwd,
      on: 'button',
      when: 'variant:ghost',
    });
    const css = cssOf('g');
    expect(ruleOf(css, '.astryx-button[data-variant="ghost"]')).toMatch(
      /background: transparent;/,
    );
    // The shorthand resets the background image where Core draws them.
    expect(css).toMatch(
      /\.astryx-button\[data-variant="ghost"\]:hover[^{]*\{\s*background-image: linear-gradient\(var\(--color-overlay-hover\),var\(--color-overlay-hover\)\);/,
    );
    expect(css).toMatch(
      /\.astryx-button\[data-variant="ghost"\]:active[^{]*\{\s*background-image: linear-gradient\(var\(--color-overlay-pressed\),var\(--color-overlay-pressed\)\);/,
    );
  }, 240_000);

  it('leaves a hover background the theme sets itself', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('h', {cwd, like: 'neutral'});
    await themeEditSet('h', 'background', '#eeeeee', {
      cwd,
      on: 'button',
      when: 'variant:ghost',
      state: 'hover',
    });
    await themeEditSet('h', 'background', 'transparent', {
      cwd,
      on: 'button',
      when: 'variant:ghost',
    });
    expect(cssOf('h')).not.toMatch(
      /\.astryx-button\[data-variant="ghost"\]:hover[^{]*\{[^}]*overlay-hover/,
    );
  }, 240_000);
});
