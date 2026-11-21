// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A text token set on a bar reaches the menus and popovers its items
 * open: Core draws a layer inside the element that opens it. The check
 * measures that token on the popover fill and gives the fix on the
 * overlays. A token the theme sets on the popover is drawn there as set.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
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

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-layer-text-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/**
 * The fixes the steps' answers gave for a menu or popover, and the menu
 * and popover problems the theme has after them.
 * @param {string} slug
 * @param {Array<[string, string, Record<string, string>]>} steps
 */
const build = async (slug, steps) => {
  await themeEditNew(slug, {cwd, like: 'neutral'});
  /** @type {string[]} */
  const fixes = [];
  for (const [thing, value, opts] of steps) {
    const r = /** @type {any} */ (
      await themeEditSet(slug, thing, value, {cwd, ...opts})
    );
    for (const p of r.data.newProblems ?? [])
      if (/^a menu or popover opened from /.test(p.problem)) fixes.push(p.fix);
  }
  const shown = /** @type {any} */ (await themeEditShow(slug, {cwd}));
  const lines = /** @type {string[]} */ (shown.data.problems ?? []).filter(p =>
    /^a menu or popover opened from /.test(p),
  );
  return {fixes, lines};
};

const HEADER = '#563d7c';

describe('a text token on a bar, in the menus opened from it', () => {
  it('is measured on the popover fill, with the fix on the overlays', async () => {
    // (The header settings of three first-try runs whose header menus drew
    // white items on a white panel.)
    const bs = await build('bs', [
      ['background-color', HEADER, {on: 'app-shell-header'}],
      ['--color-text-primary', '#ffffff', {on: 'app-shell-header'}],
      ['--color-text-secondary', '#ffffff', {on: 'app-shell-header'}],
      ['--color-text-primary', '#ffffff', {on: 'top-nav'}],
      ['--color-text-primary', '#ffffff', {on: 'layout-header'}],
      ['--color-text-secondary', '#e6dcf2', {on: 'layout-header'}],
    ]);
    expect(bs.lines).toContain(
      'a menu or popover opened from app-shell-header, top-nav, layout-header draws its --color-text-primary (#ffffff) on the popover fill (#ffffff): 1.00:1 in light; text needs 4.5:1',
    );
    expect(bs.fixes).toContain(
      "astryx experimental theme editor set bs --color-text-primary '#000000' --on overlays --mode light",
    );
    expect(
      bs.lines.some(l => /draws its --color-text-secondary /.test(l)),
    ).toBe(true);
    // (Dark text on the dark popover fill reads, so dark has no line.)
    expect(bs.lines.every(l => / in light;/.test(l))).toBe(true);

    const st = await build('st', [
      ['--color-text-primary', '#ffffff', {on: 'top-nav', mode: 'light'}],
      ['--color-text-secondary', '#dcfce7', {on: 'top-nav', mode: 'light'}],
    ]);
    expect(st.lines.length).toBe(2);
  }, 600_000);

  it('is clean once the overlays or the popover carry the token', async () => {
    const fx = await build('fx', [
      ['--color-text-primary', '#ffffff', {on: 'app-shell-header'}],
      ['--color-text-primary', '#000000', {on: 'overlays', mode: 'light'}],
    ]);
    expect(fx.lines).toEqual([]);

    const po = await build('po', [
      ['--color-text-primary', '#ffffff', {on: 'top-nav'}],
      ['--color-text-primary', '#1b1b1b', {on: 'popover'}],
    ]);
    expect(po.lines).toEqual([]);

    // (A text token on a part that is no bar, and a dark one, are left out.)
    const nb = await build('nb', [
      ['--color-text-primary', '#ffffff', {on: 'card'}],
    ]);
    expect(nb.lines).toEqual([]);
    const dk = await build('dk', [
      ['--color-text-primary', '#000000', {on: 'inputs', mode: 'light'}],
    ]);
    expect(dk.lines).toEqual([]);
  }, 600_000);
});
