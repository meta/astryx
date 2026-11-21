// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Secondary text set exactly for the whole theme, in one mode, keeps
 * the readable shade on the parts that lift it (selected items, numbered
 * citations): where the exact color reads on what those parts sit on it is
 * used as written; where it does not, they take the gray nearest it that
 * does, so raising the text's contrast never lowers it there.
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

/** The dark secondary text a part's lifted rule writes. @param {string} slug @param {string} selector */
const liftedDark = (slug, selector) =>
  new RegExp(
    `${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{\\s*--color-text-secondary: light-dark\\([^,]+, (#[0-9a-f]{6})\\)`,
  ).exec(
    fs.readFileSync(path.join(cwd, 'themes', slug, `${slug}.css`), 'utf8'),
  )?.[1];

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

describe('exact secondary text on the parts that lift it', () => {
  it('a color that does not read on the selected tint lifts to the nearest gray that does, with no new problem', async () => {
    await make('dim');
    const {data} = /** @type {any} */ (
      await themeEditSet('dim', '--color-text-secondary', '#b8a486', {
        cwd,
        mode: 'dark',
      })
    );
    expect(data.newProblems ?? []).toEqual([]);
    const item = liftedDark('dim', '.astryx-item[data-selected="selected"]');
    expect(item).toMatch(/^#[0-9a-f]{6}$/);
    expect(item).not.toBe('#b8a486');
    expect(
      liftedDark('dim', '.astryx-citation[data-variant="number"]'),
    ).not.toBe('#b8a486');
  }, 120_000);

  it('without a color dial, the base theme lift stays where the exact color does not read', async () => {
    await themeEditNew('plain', {cwd, like: 'neutral'});
    await themeEditSet('plain', '--color-text-secondary', '#8a8a8a', {
      cwd,
      mode: 'dark',
    });
    expect(
      liftedDark('plain', '.astryx-item[data-selected="selected"]'),
    ).not.toBe('#8a8a8a');
  }, 120_000);

  it('a color that reads there is used as written', async () => {
    await make('bright');
    await themeEditSet('bright', '--color-text-secondary', '#efe9e0', {
      cwd,
      mode: 'dark',
    });
    expect(liftedDark('bright', '.astryx-item[data-selected="selected"]')).toBe(
      '#efe9e0',
    );
  }, 120_000);
});
