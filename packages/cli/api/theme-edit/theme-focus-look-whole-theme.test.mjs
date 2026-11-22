// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The focus dial sets how keyboard focus looks on every focusable part
 * at once. glow writes the focus tokens as a soft halo that hugs the part,
 * and the fields, which ring themselves in their shadow, take the same halo
 * on focus, in front of a resting shadow of the theme's. ring is Core's own
 * look. Against real bundled base themes.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {compositeOver, parseColor, ratio} from './_color.mjs';
import {DIALS} from './_tables.mjs';
import {doc as apiSetDoc} from './themeEditSet.doc.mjs';
import {doc as cliSetDoc} from '../../clients/cli/commands/experimental-theme-editor-set.doc.mjs';
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
  unbuilt = await installRealBaseThemes(cwd, ['neutral', 'chocolate']);
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

/** The ring color a theme writes, as its light and dark halves. @param {string} css */
const ringOf = css => {
  const v = /--focus-outline-color: ([^;]+);/.exec(css)?.[1] ?? '';
  const pair = /^light-dark\((.+), (color-mix\(.+\)|#[0-9a-f]{6})\)$/i.exec(v);
  return pair ? {light: pair[1], dark: pair[2]} : {light: v, dark: v};
};

/** The accent share of a glow ring, or null. @param {string} v */
const shareOf = v =>
  Number(/var\(--color-accent\) (\d+)%, transparent/.exec(v)?.[1] ?? NaN);

describe('the focus dial', () => {
  it('glow reaches every focusable part, fields included', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('g', {cwd, like: 'neutral'});
    await themeEditSet('g', 'focus', 'glow', {cwd});
    const css = cssOf('g');
    expect(css).toMatch(/--focus-outline-width: 0\.25rem;/);
    expect(css).toMatch(/--focus-outline-offset: 0px;/);
    // As soft as it can be while it reads at 3:1 on every ground.
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

  it.each(['#ffd400', '#38bdf8'])(
    'glow keeps the readable ring where even the whole %s accent does not read',
    async (accent, ctx) => {
      if (needBases(ctx)) return;
      const slug = `pale${accent.slice(1)}`;
      await themeEditNew(slug, {cwd, like: 'neutral'});
      await themeEditSet(slug, 'accent', accent, {cwd});
      const without = ringOf(cssOf(slug)).light;
      await themeEditSet(slug, 'focus', 'glow', {cwd});
      const light = ringOf(cssOf(slug)).light;
      expect(light).toBe(without);
      expect(light.toLowerCase()).not.toBe(accent);
      expect(ratio(parseColor(light), parseColor('#ffffff'))).toBeGreaterThanOrEqual(3);
      if (accent === '#ffd400') expect(light.toLowerCase()).toBe('#96833f');
    },
    240_000,
  );

  it('glow reads at 3:1 on the cards of the chocolate base', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('ch', {cwd, like: 'chocolate'});
    await themeEditSet('ch', 'focus', 'glow', {cwd});
    const share = shareOf(ringOf(cssOf('ch')).light);
    const card = /** @type {[number, number, number]} */ (parseColor('#ede4d4'));
    const accent = /** @type {[number, number, number]} */ (parseColor('#8c5927'));
    expect(
      ratio(compositeOver(accent, share / 100, card), card),
    ).toBeGreaterThanOrEqual(3);
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
    const ring = ringOf(css);
    expect(ring.light).toBe('#123456');
    expect(shareOf(ring.dark)).toBeGreaterThan(25);
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

  it('the help and both set docs say what glow writes', () => {
    expect(DIALS.focus.help).not.toMatch(/quarter/);
    expect(DIALS.focus.help).toMatch(/a card and a menu/);
    for (const d of [apiSetDoc, cliSetDoc]) {
      expect(d.description).toMatch(/badges, focus, type,/);
      expect(d.description).toContain('focus ring|glow');
    }
  });
});
