// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A whole-theme border width reaches the surfaces that draw no border of
 * their own (a card, a banner, a field's box): the build frames each at the
 * theme's width and border color, so a theme with borders has them wherever
 * a box is drawn. A part with a border setting of its own keeps it; `border
 * none --on <part>` keeps one borderless; one undo takes the frames back
 * with the width. Against a real bundled base theme.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
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

/** Why a bundled theme could not be built here, when it could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-whole-border-', FIXTURE_PACKAGES);
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

const FRAME =
  /border(?:-style)?: [^;]*solid|border-width: var\(--border-width\)/;

describe('a whole-theme border width', () => {
  it('frames the surfaces that draw no border of their own, named, in one undo step', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('w', {cwd, like: 'neutral'});
    const r = await themeEditSet('w', '--border-width', '2px', {cwd});
    const note = r.data.notes.join(' ');
    expect(note).toMatch(/also frames the surfaces that draw no border/);
    const framed = /** @type {string} */ (
      /\(([^)]*)\); to keep one borderless/.exec(note)?.[1] ?? ''
    )
      .split(', ')
      .filter(Boolean);
    expect(framed.length).toBeGreaterThan(0);
    const css = cssOf('w');
    for (const p of framed) expect(rulesOf(css, p), p).toMatch(FRAME);
    await themeEditUndo('w', {cwd});
    for (const p of framed)
      expect(rulesOf(cssOf('w'), p), p).not.toMatch(FRAME);
  }, 240_000);

  it('leaves a part borderless when the theme says so, and a zero width frames nothing', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('n', {cwd, like: 'neutral'});
    const r = await themeEditSet('n', '--border-width', '2px', {cwd});
    const framed = /** @type {string} */ (
      r.data.notes.join(' ').match(/no border of their own \(([^)]*)\)/)?.[1] ??
        ''
    )
      .split(', ')
      .filter(Boolean);
    const m = r.data.notes
      .join(' ')
      .match(/`[^`]*border none --on (\S+)( --only)?`/);
    const keep = m?.[1] ?? '';
    expect(keep).not.toBe('');
    // (The line keeps that one surface borderless, the others framed.)
    await themeEditSet('n', 'border', 'none', {
      cwd,
      on: keep,
      ...(m?.[2] ? {only: true} : {}),
    });
    expect(rulesOf(cssOf('n'), keep)).not.toMatch(
      /border: var\(--border-width\) solid/,
    );
    for (const p of framed.filter(x => x !== keep))
      expect(rulesOf(cssOf('n'), p), p).toMatch(FRAME);
    await themeEditNew('z', {cwd, like: 'neutral'});
    const zero = await themeEditSet('z', '--border-width', '0px', {cwd});
    expect(zero.data.notes.join(' ')).not.toMatch(/also frames/);
    // (A width thinner than Core's own frames nothing new either.)
    await themeEditNew('th', {cwd, like: 'neutral'});
    const thin = await themeEditSet('th', '--border-width', '0.5px', {cwd});
    expect(thin.data.notes.join(' ')).not.toMatch(/also frames/);
    expect(rulesOf(cssOf('th'), 'dialog')).not.toMatch(
      /border: var\(--border-width\) solid/,
    );
  }, 240_000);

  it('frames the small boxes too when the edges are outlines, and keeps them as they are with plain borders', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('pb', {cwd, like: 'neutral'});
    const plain = await themeEditSet('pb', '--border-width', '3px', {cwd});
    // (Plain borders: a badge keeps its own, named with its line.)
    expect(rulesOf(cssOf('pb'), 'badge')).not.toMatch(FRAME);
    expect(JSON.stringify(plain.data.leftOut)).toMatch(/--on badge/);
    // (Outlines frame at any width but zero, whatever the order.)
    await themeEditNew('ro', {cwd, like: 'neutral'});
    await themeEditSet('ro', 'edges', 'outlines', {cwd});
    await themeEditSet('ro', '--border-width', '1px', {cwd});
    expect(rulesOf(cssOf('ro'), 'dialog')).toMatch(FRAME);
    // (A surfaces dial decides the surfaces' edges: nothing is framed over
    // it.)
    await themeEditNew('sr', {cwd, like: 'neutral'});
    await themeEditSet('sr', 'surfaces', 'raised', {cwd});
    await themeEditSet('sr', '--border-width', '3px', {cwd});
    expect(rulesOf(cssOf('sr'), 'dialog')).not.toMatch(FRAME);
    await themeEditNew('ol', {cwd, like: 'neutral'});
    await themeEditSet('ol', '--border-width', '3px', {cwd});
    const out = await themeEditSet('ol', 'edges', 'outlines', {cwd});
    const css = cssOf('ol');
    for (const p of ['badge', 'dialog', 'popover'])
      expect(rulesOf(css, p), p).toMatch(FRAME);
    expect(out.data.notes.join(' ')).toMatch(/also frames[^\n]*badge/);
    // A part setting wins either way.
    await themeEditSet('ol', 'border', 'none', {cwd, on: 'badge'});
    expect(rulesOf(cssOf('ol'), 'badge')).not.toMatch(
      /border: var\(--border-width\) solid/,
    );
  }, 240_000);
});
