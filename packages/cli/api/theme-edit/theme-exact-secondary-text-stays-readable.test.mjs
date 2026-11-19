// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Secondary text set exactly for the whole theme, in one mode, keeps
 * a readable shade on the accent tint (selected items, numbered citations):
 * Core measures that text from the theme's own secondary text, so where the
 * exact color reads on the tint it is used as written, and where it does not
 * the tint takes the nearest lightness of it that does. Raising the text's
 * contrast never lowers it there.
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

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

/** The dark secondary text Core measured for the accent tint. @param {string} slug */
const tintDark = slug =>
  /:scope \{[^}]*--_selected-text-secondary: light-dark\([^,]+, (#[0-9a-fA-F]{6})\)/
    .exec(
      fs.readFileSync(path.join(cwd, 'themes', slug, `${slug}.css`), 'utf8'),
    )?.[1]
    ?.toLowerCase();

/** @param {string} slug */
const make = async slug => {
  await themeEditNew(slug, {
    cwd,
    like: 'neutral',
    settings: {accent: '#1f4d3a', neutral: '#b8a283'},
  });
};

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-exact-secondary-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('exact secondary text on the accent tint', () => {
  it('a color that does not read on the selected tint lifts to the nearest gray that does, with no new problem', async () => {
    await make('dim');
    const {data} = /** @type {any} */ (
      await themeEditSet('dim', '--color-text-secondary', '#b8a486', {
        cwd,
        mode: 'dark',
      })
    );
    expect(data.newProblems ?? []).toEqual([]);
    const onTint = tintDark('dim');
    expect(onTint).toMatch(/^#[0-9a-f]{6}$/);
    expect(onTint).not.toBe('#b8a486');
  }, 120_000);

  it('without a color dial, the tint takes a readable shade where the exact color does not read', async () => {
    await themeEditNew('plain', {cwd, like: 'neutral'});
    await themeEditSet('plain', '--color-text-secondary', '#8a8a8a', {
      cwd,
      mode: 'dark',
    });
    expect(tintDark('plain')).toMatch(/^#[0-9a-f]{6}$/);
    expect(tintDark('plain')).not.toBe('#8a8a8a');
  }, 120_000);

  it('a resting secondary text on a part yields to the measured text on its selected tint, with no false problem', async () => {
    await themeEditNew('rest', {cwd, like: 'neutral'});
    const {data} = /** @type {any} */ (
      await themeEditSet('rest', '--color-text-secondary', '#9e9e9e', {
        cwd,
        on: 'item',
        mode: 'dark',
      })
    );
    expect(
      (data.newProblems ?? []).map((/** @type {any} */ p) => p.problem),
    ).not.toContainEqual(expect.stringMatching(/^text in item\b/));
    const css = fs.readFileSync(
      path.join(cwd, 'themes', 'rest', 'rest.css'),
      'utf8',
    );
    expect(css).toMatch(
      /\.astryx-item\)[^{}]*\[data-selected="selected"\] \{\s*--color-text-secondary: var\(--_selected-text-secondary\);/,
    );
  }, 120_000);

  it('a color that reads there is used as written', async () => {
    await make('bright');
    await themeEditSet('bright', '--color-text-secondary', '#efe9e0', {
      cwd,
      mode: 'dark',
    });
    expect(tintDark('bright')).toBe('#efe9e0');
  }, 120_000);
});
