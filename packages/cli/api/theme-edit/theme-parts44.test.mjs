// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * One-mode colors per variant, the spacing dial around kept steps and
 * sizes, and padding amounts read from the base theme, against real bundled
 * base themes.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  themeEditHow,
  themeEditNew,
  themeEditSet,
  themeEditShow,
} from './theme-edit.mjs';
import {sizePx, spacingSteps} from './_settings.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-parts44-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['butter', 'neutral']);
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

describe('one-mode colors on parts whose variants have their own', () => {
  it('writes each color property as itself, never as another one, in a light-only theme', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('p1', {cwd, like: 'neutral'});
    await themeEditSet('p1', 'mode', 'light-only', {cwd});
    const props = [
      'border-color',
      'outline-color',
      'color',
      'background-color',
    ];
    const parts = ['card', 'button', 'badge'];
    let n = 16;
    /** @type {Array<[string, string]>} */
    const set = [];
    for (const on of parts)
      for (const prop of props) {
        const color = `#ff00${(n++).toString(16).padStart(2, '0')}`;
        await themeEditSet('p1', prop, color, {cwd, on});
        set.push([prop, color]);
      }
    const css = cssOf('p1');
    for (const [prop, color] of set) {
      const lines = css.split('\n').filter(l => l.includes(color));
      expect(lines.length, `${prop} ${color}`).toBeGreaterThan(0);
      for (const l of lines)
        expect(l.trim().split(':')[0], `${prop} ${color}`).toBe(prop);
    }
  }, 240_000);

  it('accepts --mode on a color longhand, each variant keeping its own other half', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('p2', {cwd, like: 'neutral'});
    await themeEditSet('p2', 'background-color', '#eeeeee', {
      cwd,
      on: 'button',
      mode: 'light',
    });
    expect(ruleOf('p2', '.astryx-button[data-variant="destructive"]')).toMatch(
      /background-color: light-dark\(#eeeeee, var\(--color-error-muted\)\)/,
    );
    await themeEditSet('p2', 'border-color', '#ff0000', {
      cwd,
      on: 'card',
      mode: 'dark',
    });
    expect(ruleOf('p2', '.astryx-card[data-variant="blue"]')).toMatch(
      /border-color: light-dark\(var\(--color-border-blue\), #ff0000\)/,
    );
  }, 240_000);

  it("keeps a hover set as background-color on butter's secondary button after a light-only background", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('p3', {cwd, like: 'butter'});
    await themeEditSet('p3', 'background-color', '#ff0000', {
      cwd,
      on: 'button',
      state: 'hover',
    });
    await themeEditSet('p3', 'background', '#eeeeee', {
      cwd,
      on: 'button',
      mode: 'light',
    });
    expect(
      ruleOf('p3', `.astryx-button[data-variant="secondary"]${HOVER}`),
    ).toMatch(/background-color: #ff0000/);
  }, 240_000);

  it('gives every variant the light color and keeps an earlier plain background as the dark half (butter)', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('p4', {cwd, like: 'butter'});
    await themeEditSet('p4', 'background', '#ff0000', {cwd, on: 'button'});
    await themeEditSet('p4', 'background', '#eeeeee', {
      cwd,
      on: 'button',
      mode: 'light',
    });
    for (const name of ['primary', 'secondary', 'ghost', 'destructive']) {
      const rule = ruleOf('p4', `.astryx-button[data-variant="${name}"]`);
      expect(rule, name).toMatch(
        /background-color: light-dark\(#eeeeee, #ff0000\)/,
      );
      // Nothing after it in the rule puts the plain red back.
      expect(rule.split('light-dark(#eeeeee, #ff0000)')[1], name).not.toMatch(
        /background:/,
      );
    }
  }, 240_000);
});

describe('the spacing dial around kept steps and sizes', () => {
  it('reads a kept size written as a token, clamp(), min() or max()', () => {
    expect(sizePx('var(--spacing-12)', {'--spacing-12': '2.25rem'})).toBe(36);
    expect(sizePx('var(--nope, 30px)')).toBe(30);
    expect(sizePx('clamp(30px, 10vw, 38px)')).toBe(38);
    expect(sizePx('clamp(30px, 20px, 38px)')).toBe(30);
    expect(sizePx('min(40px, 2rem)')).toBe(32);
    expect(sizePx('max(40px, 2rem)')).toBe(40);
  });

  it('keeps spacing steps in order around a kept one', () => {
    /** @type {Array<[string, number]>} */
    const steps = [
      ['--spacing-1', 4],
      ['--spacing-2', 8],
      ['--spacing-3', 12],
      ['--spacing-4', 16],
      ['--spacing-5', 20],
    ];
    for (const [
      f,
      kept,
    ] of /** @type {Array<[number, Record<string, number>]>} */ ([
      [1.25, {'--spacing-4': 13}],
      [0.75, {'--spacing-3': 12.8}],
    ])) {
      const n = spacingSteps(steps, f, kept).map(([, v]) => v);
      for (let i = 1; i < n.length; i++)
        expect(n[i], `${f} ${i}`).toBeGreaterThan(n[i - 1]);
    }
  });

  it('keeps sizes in order around a token or clamp() size, and around a part size under a whole-theme dial (neutral)', async ctx => {
    if (needBases(ctx)) return;
    /** @param {string} rule */
    const lg = rule =>
      parseFloat(/--size-element-lg:\s*([\d.]+)px/.exec(rule)?.[1] ?? '0');
    await themeEditNew('d5', {cwd, like: 'neutral'});
    await themeEditSet('d5', '--size-element-md', 'clamp(30px, 10vw, 38px)', {
      cwd,
    });
    await themeEditSet('d5', 'spacing', 'tight', {cwd});
    expect(lg(cssOf('d5'))).toBeGreaterThan(38);

    await themeEditNew('d7', {cwd, like: 'neutral'});
    await themeEditSet('d7', '--size-element-md', '34px', {cwd, on: 'button'});
    const r = await themeEditSet('d7', 'spacing', 'tight', {cwd});
    expect(lg(ruleOf('d7', '.astryx-button'))).toBeGreaterThan(34);
    expect(r.data.notes.join(' ')).toMatch(
      /keeps your exact --size-element-md = 34px on button/,
    );

    await themeEditNew('d6', {cwd, like: 'neutral'});
    await themeEditSet('d6', '--spacing-4', '13px', {cwd});
    await themeEditSet('d6', 'spacing', 'spacious', {cwd});
    const s3 = /--spacing-3:\s*([\d.]+)rem/.exec(cssOf('d6'))?.[1];
    expect(Number(s3) * 16).toBeLessThan(13);
  }, 240_000);
});

describe('padding amounts read from the base theme', () => {
  it("doubles butter's own block and inline button padding", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('h12', {cwd, like: 'butter'});
    await themeEditShow('h12', {cwd});
    const r = await themeEditHow('double the button padding', {
      cwd,
      theme: 'h12',
    });
    expect(JSON.stringify(r.data)).toMatch(/padding '1rem 2rem' --on button/);
  }, 240_000);
});
