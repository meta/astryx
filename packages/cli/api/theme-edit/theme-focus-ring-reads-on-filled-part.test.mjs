// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A focus ring is drawn on what lies under the part it rings. A part
 * the theme fills (a top bar in the accent color) points the focus ring of
 * what it holds at a color that reads on that fill, so keyboard focus on a
 * top nav item still shows. A ring color the theme sets there stays as set,
 * and a fill the ring already reads on gets nothing. Against real bundled
 * base themes.
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
  cwd = makeLinkedFixture('astryx-theme-focus-on-fill-', FIXTURE_PACKAGES);
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

/** The focus ring colors written on a part (the app shell header). @param {string} slug @param {string} [part] */
const headerRings = (slug, part = 'app-shell-header') =>
  [
    ...fs
      .readFileSync(path.join(cwd, 'themes', slug, `${slug}.css`), 'utf8')
      .matchAll(
        new RegExp(
          `\\.astryx-${part}\\)?[^{]*\\{[^}]*--focus-outline-color: ([^;]+);`,
          'g',
        ),
      ),
  ].map(m => m[1]);

describe('a focus ring inside a part the theme fills', () => {
  it('reads on the fill when the ring color is the fill', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('f', {cwd, like: 'neutral'});
    await themeEditSet('f', 'accent', '#3b5998', {cwd});
    await themeEditSet('f', 'background-color', '#3b5998', {
      cwd,
      on: 'app-shell-header',
      mode: 'light',
    });
    const rings = headerRings('f');
    expect(rings.length).toBeGreaterThan(0);
    expect(new Set(rings)).toEqual(new Set(['#ffffff']));
  }, 240_000);

  it("takes the part's own text color when that reads", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('t', {cwd, like: 'neutral'});
    await themeEditSet('t', 'accent', '#3b5998', {cwd});
    await themeEditSet('t', 'background-color', '#3b5998', {
      cwd,
      on: 'app-shell-header',
      mode: 'light',
    });
    await themeEditSet('t', '--color-text-primary', '#ffd54f', {
      cwd,
      on: 'app-shell-header',
      mode: 'light',
    });
    expect(new Set(headerRings('t'))).toEqual(new Set(['#ffd54f']));
  }, 240_000);

  it('keeps a ring color the theme sets there, and writes none on a fill it reads on', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('k', {cwd, like: 'neutral'});
    await themeEditSet('k', 'accent', '#3b5998', {cwd});
    await themeEditSet('k', '--focus-outline-color', '#ff00ff', {
      cwd,
      on: 'app-shell-header',
    });
    await themeEditSet('k', 'background-color', '#3b5998', {
      cwd,
      on: 'app-shell-header',
      mode: 'light',
    });
    expect(new Set(headerRings('k'))).toEqual(new Set(['#ff00ff']));
    await themeEditNew('w', {cwd, like: 'neutral'});
    await themeEditSet('w', 'accent', '#3b5998', {cwd});
    await themeEditSet('w', 'background-color', '#ffffff', {
      cwd,
      on: 'app-shell-header',
      mode: 'light',
    });
    expect(headerRings('w')).toEqual([]);
  }, 240_000);

  it('is decided from the fill in effect in each mode', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('e', {cwd, like: 'neutral'});
    await themeEditSet('e', 'accent', '#3b5998', {cwd});
    await themeEditSet('e', 'background-color', '#3b5998', {
      cwd,
      on: 'app-shell-header',
    });
    const both = headerRings('e');
    // (A later light fill the theme's ring reads on takes the light ring
    // away; dark keeps it.)
    await themeEditSet('e', 'background-color', '#ffffff', {
      cwd,
      on: 'app-shell-header',
      mode: 'light',
    });
    const after = headerRings('e');
    expect(after.length).toBeGreaterThan(0);
    expect(after.length).toBeLessThan(both.length);
  }, 240_000);

  it('gives a card inside the filled part a ring that reads on the card', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('cd', {cwd, like: 'neutral'});
    await themeEditSet('cd', 'background-color', '#2d4373', {
      cwd,
      on: 'layout-content',
      mode: 'light',
    });
    expect(headerRings('cd', 'layout-content').length).toBeGreaterThan(0);
    const card = headerRings('cd', 'card');
    expect(card.length).toBeGreaterThan(0);
    expect(card).not.toContain('#ffffff');
  }, 240_000);

  it('gives any part inside that paints its own fill a ring that reads on it', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('sh', {cwd, like: 'neutral'});
    await themeEditSet('sh', 'background-color', '#2d4373', {
      cwd,
      on: 'app-shell',
      mode: 'light',
    });
    await themeEditSet('sh', 'background-color', '#ffffff', {
      cwd,
      on: 'app-shell-header',
      mode: 'light',
    });
    expect(headerRings('sh', 'app-shell')).toContain('#ffffff');
    const bar = headerRings('sh');
    expect(bar.length).toBeGreaterThan(0);
    expect(bar).not.toContain('#ffffff');
  }, 240_000);

  it('writes none on a part that draws its own ring, which lies on the page', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('fb', {cwd, like: 'neutral'});
    await themeEditSet('fb', 'background-color', '#2d4373', {
      cwd,
      on: 'button',
      mode: 'light',
    });
    expect(headerRings('fb', 'button')).toEqual([]);
  }, 240_000);
});
