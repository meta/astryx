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
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';

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

describe('the other half of a one-mode color in a variant or a state', () => {
  it("is the part's own color for a heading level", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('o1', {cwd, like: 'y2k'});
    await themeEditSet('o1', 'color', '#ff0000', {cwd, on: 'heading'});
    await themeEditSet('o1', 'color', '#00ff00', {
      cwd,
      on: 'heading',
      when: 'level:1',
      mode: 'dark',
    });
    expect(ruleOf('o1', '.astryx-heading[data-level="1"]')).toMatch(
      /--color-text-primary: light-dark\(#ff0000, #00ff00\)/,
    );
  }, 240_000);

  it("is the theme's final value of a token, set after it", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('o2', {cwd, like: 'butter'});
    await themeEditSet('o2', '--color-accent', '#ff00ff', {
      cwd,
      on: 'button',
      state: 'hover',
      mode: 'dark',
    });
    await themeEditSet('o2', 'accent', '#16a34a', {cwd});
    expect(ruleOf('o2', `.astryx-button${HOVER}`)).toMatch(
      /--color-accent: light-dark\(#16a34a, #ff00ff\)/,
    );
  }, 240_000);

  it("is the variant's resting color for a state, in either order", async ctx => {
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
      expect(
        ruleOf(slug, `.astryx-button[data-variant="primary"]${HOVER}`),
        order,
      ).toMatch(/background-color: light-dark\(#0000ff, #ff0000\)/);
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
    const rule = ruleOf('b1', '.astryx-divider');
    expect(rule).toMatch(
      /background-image: linear-gradient\(light-dark\(transparent, red\), light-dark\(transparent, blue\)\)/,
    );
    expect(rule).toMatch(/background-color: light-dark\([^,]+, #f00\)/);
    expect(rule).not.toMatch(/background-(image|position): [^;]*#f00/);
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

  it('says a one-mode part color overrides contextual rules in the other mode', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('b3', {cwd, like: 'neutral'});
    const r = await themeEditSet('b3', 'background-color', '#ff00ff', {
      cwd,
      on: 'button',
      mode: 'dark',
    });
    expect(r.data.notes.join(' ')).toMatch(/overrides what Core or the base/);
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
