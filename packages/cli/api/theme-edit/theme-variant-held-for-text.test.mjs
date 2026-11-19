// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A setting on one part that would make its text unreadable in one of its
 * variants drawn on another ground keeps that variant at Core's look: a top
 * nav link colored for a dark bar keeps Core's color in the phone menu
 * (`mode:drawer`, on the menu's own surface), named with the line that gives
 * it there anyway; one undo takes both back. Against a real bundled base
 * theme, whose census renders the shell's phone layout (playground.mobile).
 */
import fs from 'node:fs';
import path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditUndo} from './theme-edit.mjs';
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
/** @type {string | null} */
let unbuilt = null;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-variant-held-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
}, 300_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {{skip: (note?: string) => void}} ctx */
const needBases = ctx => {
  if (unbuilt) ctx.skip(unbuilt);
  return Boolean(unbuilt);
};

/** @param {string} theme */
const cssOf = theme =>
  fs.readFileSync(path.join(cwd, 'themes', theme, `${theme}.css`), 'utf8');

describe('a top nav link colored for a dark bar', () => {
  it("keeps Core's color in the phone menu, named, and one undo takes it back", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('bar', {cwd, like: 'neutral'});
    await themeEditSet('bar', 'mode', 'light-only', {cwd});
    await themeEditSet('bar', 'background-color', '#222222', {
      cwd,
      on: 'app-shell-header',
    });
    // (The selected link's own block, dark in the bar and the menu alike.)
    await themeEditSet('bar', 'background-color', '#000000', {
      cwd,
      on: 'top-nav-item',
      state: 'selected',
    });
    const r = await themeEditSet('bar', 'color', '#bfbfbf', {
      cwd,
      on: 'top-nav-item',
    });
    const css = cssOf('bar');
    // In the bar: the color set.
    expect(css).toMatch(/\.astryx-top-nav-item[^{]*\{[^}]*color: #bfbfbf/);
    // In the phone menu: Core's own color again.
    expect(css).toMatch(
      /\.astryx-top-nav-item[^{]*\[data-mode="drawer"\][^{]*\{[^}]*color: revert-layer/,
    );
    expect(r.data.notes.join('\n')).toMatch(
      /top-nav-item keeps Core's color where it is drawn as mode=drawer .*set bar color '#bfbfbf' --on top-nav-item --when 'mode:drawer'( --mode light)? --only/,
    );
    expect(
      (r.data.newProblems ?? [])
        .map((/** @type {any} */ p) => p.problem)
        .join('\n'),
    ).not.toMatch(/mobile-nav's/);
    await themeEditUndo('bar', {cwd});
    expect(cssOf('bar')).not.toMatch(/#bfbfbf/);
  }, 240_000);

  it('lets the color reach the phone menu when the theme darkens the menu too', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('dk', {cwd, like: 'neutral'});
    await themeEditSet('dk', 'mode', 'light-only', {cwd});
    await themeEditSet('dk', 'background-color', '#222222', {
      cwd,
      on: 'app-shell-header',
    });
    await themeEditSet('dk', 'background-color', '#000000', {
      cwd,
      on: 'top-nav-item',
      state: 'selected',
    });
    // (Held while the menu is white...)
    await themeEditSet('dk', 'color', '#bfbfbf', {cwd, on: 'top-nav-item'});
    expect(cssOf('dk')).toMatch(
      /\.astryx-top-nav-item[^{]*\[data-mode="drawer"\][^{]*\{[^}]*color: revert-layer/,
    );
    // (...and reaching it once the theme darkens the menu as well.)
    const r = await themeEditSet(
      'dk',
      '--color-background-surface',
      '#222222',
      {cwd, on: 'mobile-nav'},
    );
    expect(cssOf('dk')).not.toMatch(
      /\.astryx-top-nav-item[^{]*\[data-mode="drawer"\][^{]*\{[^}]*color: revert-layer/,
    );
    expect(
      (r.data.newProblems ?? [])
        .map((/** @type {any} */ p) => p.problem)
        .join('\n'),
    ).not.toMatch(/top-nav-item/);
    // (A menu made white again holds the links again, at build.)
    await themeEditSet('dk', '--color-background-surface', '#ffffff', {
      cwd,
      on: 'mobile-nav',
    });
    expect(cssOf('dk')).toMatch(
      /\.astryx-top-nav-item[^{]*\[data-mode="drawer"\][^{]*\{[^}]*color: revert-layer/,
    );
  }, 240_000);

  it('keeps a drawer color the theme set there itself', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('own', {cwd, like: 'neutral'});
    await themeEditSet('own', 'mode', 'light-only', {cwd});
    await themeEditSet('own', 'background-color', '#222222', {
      cwd,
      on: 'app-shell-header',
    });
    await themeEditSet('own', 'color', '#333333', {
      cwd,
      on: 'top-nav-item',
      when: 'mode:drawer',
      only: true,
    });
    await themeEditSet('own', 'color', '#bfbfbf', {cwd, on: 'top-nav-item'});
    const drawer =
      cssOf('own').match(
        /\.astryx-top-nav-item[^{]*\[data-mode="drawer"\][^{]*\{[^}]*\}/g,
      ) ?? [];
    expect(drawer.join('\n')).toMatch(/#333333/);
    expect(drawer.join('\n')).not.toMatch(/revert-layer/);
  }, 240_000);

  it('holds nothing where the color reads in the menu too', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('ok', {cwd, like: 'neutral'});
    await themeEditSet('ok', 'mode', 'light-only', {cwd});
    const r = await themeEditSet('ok', 'color', '#333333', {
      cwd,
      on: 'top-nav-item',
    });
    expect(r.data.notes.join('\n')).not.toMatch(/keeps Core's color/);
    expect(cssOf('ok')).not.toMatch(/\[data-mode="drawer"\][^{]*\{[^}]*color/);
  }, 240_000);
});
