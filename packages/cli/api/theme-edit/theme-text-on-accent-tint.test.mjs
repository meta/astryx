// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Text on the accent tint keeps reading: a text color set on a part reaches
 * the text inside it that reads the text tokens, and the accent tint keeps a
 * stop under which text set exactly still reads.
 */

import fs from 'node:fs';
import path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';
import {parseColor, ratio} from './_color.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

/** @param {string} slug */
const css = slug =>
  fs.readFileSync(path.join(cwd, 'themes', slug, `${slug}.css`), 'utf8');

/** @param {string} slug @param {string} token @returns {[string, string]} */
const halves = (slug, token) => {
  const m = new RegExp(
    `${token}: light-dark\\((#[0-9a-f]{6,8}), (#[0-9a-f]{6,8})\\)`,
  ).exec(css(slug));
  if (!m) throw new Error(`${token} is not a light-dark() pair in ${slug}`);
  return [m[1], m[2]];
};

/** A color over another, as the eye sees it. @param {string} c @param {string} under */
const seen = (c, under) => {
  if (c.length === 7) return c;
  const a = parseInt(c.slice(7), 16) / 255;
  const ch = (/** @type {string} */ x, /** @type {number} */ k) =>
    parseInt(x.slice(1 + k * 2, 3 + k * 2), 16);
  return `#${[0, 1, 2]
    .map(k =>
      Math.round(a * ch(c, k) + (1 - a) * ch(under, k))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
};

/** @param {string} a @param {string} b */
const contrast = (a, b) =>
  ratio(
    /** @type {[number, number, number]} */ (parseColor(a)),
    /** @type {[number, number, number]} */ (parseColor(b)),
  );

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-accent-tint-text-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('text on the accent tint', () => {
  it('a link color set exactly still reads on the tint of a selected preset', async () => {
    await themeEditNew('nt', {cwd, like: 'neutral'});
    await themeEditSet('nt', 'neutral', '#787774', {cwd});
    await themeEditSet('nt', 'accent', '#1d70c4', {cwd});
    await themeEditSet('nt', '--color-text-accent', '#529cca', {
      cwd,
      mode: 'dark',
    });
    const tint = halves('nt', '--color-accent-muted')[1];
    const page = halves('nt', '--color-background-body')[1];
    expect(contrast('#529cca', seen(tint, page))).toBeGreaterThanOrEqual(4.5);
  }, 240_000);

  it("a selected row's text color reaches the labels inside it", async () => {
    await themeEditNew('aq', {cwd, like: 'neutral'});
    await themeEditSet('aq', 'accent', '#1f6fd9', {cwd});
    await themeEditSet('aq', '--color-accent-muted', '#2f6ccf', {
      cwd,
      on: 'table-row',
      state: 'selected',
    });
    await themeEditSet('aq', 'color', '#ffffff', {
      cwd,
      on: 'table-row',
      state: 'selected',
    });
    const rule =
      /\.astryx-table-row\[data-selected="selected"\][^{]*\{([^}]*)\}/.exec(
        css('aq'),
      )?.[1];
    expect(rule).toMatch(/--color-text-secondary: #ffffff/);
    expect(rule).toMatch(/--color-text-primary: #ffffff/);
  }, 240_000);
});
