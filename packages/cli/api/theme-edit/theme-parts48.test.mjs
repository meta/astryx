// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * One-mode settings in a variant or a state take the theme's own value
 * around them as their other half; a color in a one-mode gradient layer is
 * that mode's background color; a CSS-wide keyword takes no mode; the
 * corners dial reaches parts whose base rule gives its own radius. Against
 * real bundled base themes, each check reads what each mode resolves to in
 * the built stylesheet.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {backgroundColorLayer} from './_settings.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';
import {modeValue, refusal} from '../../test-utils/theme-edit-fixture.mjs';

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
  cwd = makeLinkedFixture('astryx-theme-parts48-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral', 'butter', 'y2k']);
}, 300_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} slug */
const cssOf = slug =>
  fs.readFileSync(path.join(cwd, 'themes', slug, `${slug}.css`), 'utf8');

/** @param {string} slug @param {string} selector */
const ruleOf = (slug, selector) => {
  const css = cssOf(slug);
  const i = css.indexOf(`${selector} {`);
  return i < 0 ? '' : css.slice(i, css.indexOf('}', i));
};

/** @param {import('vitest').TestContext} ctx */
const needBases = ctx => {
  if (!unbuilt) return false;
  console.warn(`skipped: ${unbuilt}`);
  ctx.skip();
  return true;
};

const HOVER = ':hover:where(:not(:disabled,[aria-disabled="true"]))';

describe('the other mode of a one-mode color in a variant or a state', () => {
  it("keeps the part's own color for a heading level", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('o1', {cwd, like: 'y2k'});
    await themeEditSet('o1', 'color', '#ff0000', {cwd, on: 'heading'});
    await themeEditSet('o1', 'color', '#00ff00', {
      cwd,
      on: 'heading',
      when: 'level:1',
      mode: 'dark',
    });
    // The level's dark block alone: in light the heading's own rule holds.
    const css = cssOf('o1');
    const level = '.astryx-heading[data-level="1"]';
    expect(modeValue(css, level, '--color-text-primary', 'dark')).toBe(
      '#00ff00',
    );
    expect(modeValue(css, level, '--color-text-primary', 'light')).toBe(
      undefined,
    );
    expect(
      modeValue(css, '.astryx-heading', '--color-text-primary', 'light'),
    ).toBe('#ff0000');
  }, 240_000);

  it("keeps the theme's final value of a token, set after it", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('o2', {cwd, like: 'butter'});
    await themeEditSet('o2', '--color-accent', '#ff00ff', {
      cwd,
      on: 'button',
      state: 'hover',
      mode: 'dark',
    });
    await themeEditSet('o2', 'accent', '#16a34a', {cwd});
    const css = cssOf('o2');
    expect(
      modeValue(css, `.astryx-button${HOVER}`, '--color-accent', 'dark'),
    ).toBe('#ff00ff');
    expect(
      modeValue(css, `.astryx-button${HOVER}`, '--color-accent', 'light'),
    ).toBe(undefined);
  }, 240_000);

  it("keeps the variant's resting color for a state, in either order", async ctx => {
    if (needBases(ctx)) return;
    for (const [slug, order] of /** @type {const} */ ([
      ['o3', 'rest first'],
      ['o4', 'state first'],
    ])) {
      await themeEditNew(slug, {cwd, like: 'neutral'});
      const rest = () =>
        themeEditSet(slug, 'background-color', '#0000ff', {
          cwd,
          on: 'button',
          when: 'variant:primary',
        });
      const hover = () =>
        themeEditSet(slug, 'background-color', '#ff0000', {
          cwd,
          on: 'button',
          when: 'variant:primary',
          state: 'hover',
          mode: 'dark',
        });
      if (order === 'rest first') {
        await rest();
        await hover();
      } else {
        await hover();
        await rest();
      }
      const css = cssOf(slug);
      const sel = '.astryx-button[data-variant="primary"]';
      expect(
        modeValue(css, `${sel}${HOVER}`, 'background-color', 'dark'),
        order,
      ).toBe('#ff0000');
      expect(
        modeValue(css, `${sel}${HOVER}`, 'background-color', 'light'),
        order,
      ).toBe(undefined);
      expect(modeValue(css, sel, 'background-color', 'light'), order).toBe(
        '#0000ff',
      );
    }
  }, 240_000);
});

describe('one-mode backgrounds and keywords', () => {
  it("splits a gradient layer's color into that mode's background color", async ctx => {
    if (needBases(ctx)) return;
    expect(backgroundColorLayer('linear-gradient(red, blue) #00f')).toEqual({
      images: 'linear-gradient(red, blue)',
      color: '#00f',
    });
    await themeEditNew('b1', {cwd, like: 'neutral'});
    await themeEditSet('b1', 'background', '#f00 linear-gradient(red, blue)', {
      cwd,
      on: 'divider',
      mode: 'dark',
    });
    // The dark block takes the images and the color under them, apart.
    const css = cssOf('b1');
    expect(modeValue(css, '.astryx-divider', 'background-image', 'dark')).toBe(
      'linear-gradient(red, blue)',
    );
    expect(modeValue(css, '.astryx-divider', 'background-color', 'dark')).toBe(
      '#f00',
    );
    expect(modeValue(css, '.astryx-divider', 'background-image', 'light')).toBe(
      undefined,
    );
  }, 240_000);

  it('refuses a CSS-wide keyword with --mode', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('b2', {cwd, like: 'neutral'});
    const r = await refusal(() =>
      themeEditSet('b2', 'background-color', 'unset', {
        cwd,
        on: 'badge',
        mode: 'dark',
      }),
    );
    expect(r.code).toBe('ERR_THEME_NO_MODE');
    expect(r.run[0]).toMatch(/background-color unset --on badge$/);
  }, 240_000);

  it('writes a one-mode part color in its mode block, with no note about the other mode', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('b3', {cwd, like: 'neutral'});
    const r = await themeEditSet('b3', 'background-color', '#ff00ff', {
      cwd,
      on: 'button',
      mode: 'dark',
    });
    expect(r.data.notes.join(' ')).not.toMatch(
      /overrides what Core or the base/,
    );
    expect(
      modeValue(cssOf('b3'), '.astryx-button', 'background-color', 'light'),
    ).toBe(undefined);
  }, 240_000);
});

describe('the corners dial and parts whose base rule gives a radius', () => {
  it('reaches every part rule with a radius of its own, and steps from what a part shows', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('c1', {cwd, like: 'y2k'});
    await themeEditSet('c1', 'corners', 'pill', {cwd});
    for (const sel of ['.astryx-button', '.astryx-card'])
      expect(ruleOf('c1', sel), sel).toMatch(
        /border-radius: var\(--radius-(element|container)\)/,
      );
    // The badge is a pill in the base: a step down rounds it less.
    await themeEditNew('c2', {cwd, like: 'y2k'});
    await themeEditSet('c2', 'corners', 'less', {cwd, on: 'badge'});
    // The button is square in the base: a step up rounds it.
    await themeEditSet('c2', 'corners', 'more', {cwd, on: 'button'});
    expect(ruleOf('c2', '.astryx-button')).not.toMatch(/border-radius: 0px/);
  }, 240_000);
});
