// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The focus dial sets how keyboard focus looks on every focusable part
 * at once. glow writes the focus tokens as a soft halo that hugs the part,
 * and the fields, which ring themselves in their shadow, take the same halo
 * on focus, over a resting shadow of the theme's. ring is Core's own look.
 * Against real bundled base themes.
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
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-focus-look-', FIXTURE_PACKAGES);
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

const GLOW = '0 0 0 var(--focus-outline-width) var(--focus-outline-color)';

describe('the focus dial', () => {
  it('glow reaches every focusable part, fields included', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('g', {cwd, like: 'neutral'});
    await themeEditSet('g', 'focus', 'glow', {cwd});
    const css = cssOf('g');
    expect(css).toMatch(/--focus-outline-width: 0\.25rem;/);
    expect(css).toMatch(/--focus-outline-offset: 0px;/);
    // (As soft as it can be while it reads at 3:1 on the page and a
    // surface.)
    const share = Number(
      /--focus-outline-color: [^;]*color-mix\(in srgb, var\(--color-accent\) (\d+)%, transparent\)/.exec(
        css,
      )?.[1],
    );
    expect(share).toBeGreaterThan(25);
    expect(share).toBeLessThanOrEqual(100);
    // A field rings itself in its shadow: it takes the same halo.
    expect(css).toContain(
      `.astryx-text-input:focus-within {\n    box-shadow: ${GLOW};`,
    );
  }, 240_000);

  it('glow keeps the theme ring where even the whole accent does not read', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('gy', {cwd, like: 'neutral'});
    await themeEditSet('gy', 'accent', '#ffd400', {cwd});
    await themeEditSet('gy', 'focus', 'glow', {cwd});
    const css = cssOf('gy');
    // (Light keeps the palette's readable ring shade, never the accent.)
    expect(css).toMatch(
      /--focus-outline-color: light-dark\(#(?!ffd400)[0-9a-f]{6}, color-mix/i,
    );
  }, 240_000);

  it('glow is still searched in the mode the theme sets no ring for', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('gm', {cwd, like: 'neutral'});
    await themeEditSet('gm', '--focus-outline-color', '#123456', {
      cwd,
      mode: 'light',
    });
    await themeEditSet('gm', 'focus', 'glow', {cwd});
    const css = cssOf('gm');
    expect(css).toMatch(/#123456/);
    const share = Number(
      /--focus-outline-color: [^;]*color-mix\(in srgb, var\(--color-accent\) (\d+)%, transparent\)/.exec(
        css,
      )?.[1],
    );
    expect(share).toBeGreaterThan(25);
  }, 240_000);

  it('glow goes over a resting shadow the theme gives the fields', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('s', {cwd, like: 'neutral'});
    const bevel = 'inset 1px 1px 0 #808080, inset -1px -1px 0 #ffffff';
    await themeEditSet('s', 'box-shadow', bevel, {cwd, on: 'inputs'});
    await themeEditSet('s', 'focus', 'glow', {cwd});
    expect(cssOf('s')).toContain(
      `.astryx-text-input:focus-within {\n    box-shadow: ${GLOW}, ${bevel};`,
    );
  }, 240_000);

  it('glow goes on a status the theme gives its own resting shadow, and on the rest', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('st', {cwd, like: 'neutral'});
    await themeEditSet('st', 'box-shadow', '0 0 0 1px #b00020', {
      cwd,
      on: 'text-input',
      when: 'status:error',
    });
    await themeEditSet('st', 'focus', 'glow', {cwd});
    expect(cssOf('st')).toContain(
      `.astryx-text-input:focus-within {\n    box-shadow: ${GLOW};`,
    );
  }, 240_000);

  it('glow reads inside a part the theme fills with the accent', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('fa', {cwd, like: 'neutral'});
    await themeEditSet('fa', 'accent', '#3b5998', {cwd});
    await themeEditSet('fa', 'background-color', 'var(--color-accent)', {
      cwd,
      on: 'app-shell-header',
      mode: 'light',
    });
    await themeEditSet('fa', 'focus', 'glow', {cwd});
    expect(cssOf('fa')).toMatch(
      /\.astryx-app-shell-header\)?[^{]*\{[^}]*--focus-outline-color: #ffffff;/,
    );
  }, 240_000);

  it('applies to the whole theme only', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('on', {cwd, like: 'neutral'});
    const e = await themeEditSet('on', 'focus', 'glow', {
      cwd,
      on: 'button',
    }).catch(x => x);
    expect(e?.code).toMatch(/^ERR_/);
    expect(String(e?.message)).toMatch(/drop --on/);
  }, 240_000);

  it("ring is Core's own look", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('r', {cwd, like: 'neutral'});
    await themeEditSet('r', 'focus', 'ring', {cwd});
    const css = cssOf('r');
    expect(css).not.toMatch(/--focus-outline-width:/);
    expect(css).not.toContain(GLOW);
  }, 240_000);
});
