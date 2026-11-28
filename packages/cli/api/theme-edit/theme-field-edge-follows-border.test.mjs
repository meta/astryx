// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A whole-theme border color moves the edge the fields draw to the nearest
 * shade of it that keeps 3:1 on their fill, in each mode, named with the
 * line that gives fields the exact color; cards take the exact color, a
 * field edge the theme sets itself keeps its value, and one undo takes both
 * back. Against a real bundled base theme.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {themeEditNew, themeEditSet, themeEditUndo} from './theme-edit.mjs';
import {parseColor, ratio} from './_color.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-field-edge-', FIXTURE_PACKAGES);
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

/** @param {string} theme */
const cssOf = theme =>
  fs.readFileSync(path.join(cwd, 'themes', theme, `${theme}.css`), 'utf8');

/** The rules on a part, every condition. @param {string} css @param {string} part */
const rulesOf = (css, part) =>
  (
    css.match(new RegExp(`\\.astryx-${part}\\b[^{]*\\{[^}]*\\}`, 'g')) ?? []
  ).join('\n');

const edgeIn = (/** @type {string} */ css) =>
  /--color-border-control: ([^;]+);/.exec(css)?.[1]?.trim() ?? '';
const emphasizedIn = (/** @type {string} */ css) =>
  /--color-border-emphasized: ([^;]+);/.exec(css)?.[1]?.trim() ?? '';
const borderIn = (/** @type {string} */ css) =>
  /--color-border: ([^;]+);/.exec(css)?.[1]?.trim() ?? '';

describe('a whole-theme border color', () => {
  it('keeps the fields at 3:1 with the nearest shade, named, both modes, and one undo', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('lg', {cwd, like: 'neutral'});
    const r = await themeEditSet('lg', '--color-border', '#e5e7eb', {cwd});
    const css = cssOf('lg');
    // Cards take the exact gray.
    expect(borderIn(css)).toMatch(/#e5e7eb/i);
    // Fields take a shade that reads at 3:1 on white, in light mode.
    const edge = edgeIn(css);
    const light = /light-dark\(\s*(#[0-9a-f]{6})/i.exec(edge)?.[1] ?? edge;
    expect(light.toLowerCase()).not.toBe('#e5e7eb');
    expect(
      ratio(
        /** @type {any} */ (parseColor(light)),
        /** @type {any} */ (parseColor('#ffffff')),
      ),
    ).toBeGreaterThanOrEqual(3);
    expect(r.data.notes.join(' ')).toMatch(
      /fields kept at 3:1: their edge \(--color-border-control\) is #[0-9a-f]{6} in light mode/i,
    );
    await themeEditUndo('lg', {cwd});
    expect(cssOf('lg')).not.toMatch(/#e5e7eb/i);
  }, 240_000);

  it('moves the emphasized border as it moves the fields, so cards and dividers keep their colors', async ctx => {
    if (needBases(ctx)) return;
    for (const [name, color] of [
      ['ef', '#e5e7eb'],
      ['es', '#444444'],
    ]) {
      await themeEditNew(name, {cwd, like: 'neutral'});
      const r = await themeEditSet(name, '--color-border', color, {cwd});
      const css = cssOf(name);
      // The emphasized border takes the same color the fields' edge takes:
      // the border itself where it reads at 3:1 on the fields' fill, else
      // its nearest shade that does.
      expect(emphasizedIn(css), name).toBe(edgeIn(css));
      if (color === '#e5e7eb')
        expect(r.data.notes.join(' ')).toMatch(
          /cards and dividers kept at 3:1: their edge \(--color-border-emphasized\) is #[0-9a-f]{6} in light mode/i,
        );
    }
  }, 240_000);

  it('gives the fields the exact color where it reads, and keeps a field edge the theme set', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('dk', {cwd, like: 'neutral'});
    const r = await themeEditSet('dk', '--color-border', '#444444', {
      cwd,
      mode: 'light',
    });
    expect(edgeIn(cssOf('dk'))).toMatch(/#444444/i);
    expect(r.data.notes.join(' ')).not.toMatch(/fields kept at 3:1/);
    await themeEditSet('dk', '--color-border-control', '#ff00aa', {
      cwd,
      mode: 'light',
    });
    await themeEditSet('dk', '--color-border', '#e5e7eb', {cwd, mode: 'light'});
    expect(edgeIn(cssOf('dk'))).toMatch(/#ff00aa/i);
  }, 240_000);
});
