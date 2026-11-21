// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A page color the theme writes is that one color: the neutral
 * color's surfaces (cards, popovers, the surface) keep the shades made for
 * the base theme's page, in light-only and two-mode themes alike, so text
 * on a popover still reads.
 */

import fs from 'node:fs';
import path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {parseColor, ratio} from './_color.mjs';
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

const SURFACES = [
  '--color-background-surface',
  '--color-background-card',
  '--color-background-popover',
];

/**
 * A page token's value in a theme's built CSS, as `[light, dark]`.
 * @param {string} slug @param {string} token
 * @returns {[string, string]}
 */
const valueOf = (slug, token) => {
  const css = fs.readFileSync(
    path.join(cwd, 'themes', slug, `${slug}.css`),
    'utf8',
  );
  const v = new RegExp(`${token}:\\s*([^;]+);`).exec(css)?.[1]?.trim() ?? '';
  const pair = /^light-dark\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)$/.exec(v);
  return pair ? [pair[1], pair[2]] : [v, v];
};

/** @param {string} slug */
const surfacesOf = slug =>
  Object.fromEntries(SURFACES.map(t => [t, valueOf(slug, t)]));

/** @type {Record<string, Record<string, [string, string]>>} */
const before = {};

beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-page-color-writes-neutral-',
    FIXTURE_PACKAGES,
  );
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
  // A light-only theme with a gray neutral color, and a two-mode one.
  await themeEditNew('w', {cwd, like: 'neutral'});
  await themeEditSet('w', 'mode', 'light-only', {cwd});
  await themeEditSet('w', 'neutral', '#808080', {cwd});
  await themeEditNew('v', {cwd, like: 'neutral'});
  await themeEditSet('v', 'neutral', '#808080', {cwd});
  // And one with no neutral color.
  await themeEditNew('p', {cwd, like: 'neutral'});
  for (const slug of ['w', 'v', 'p']) {
    before[slug] = surfacesOf(slug);
    await themeEditSet(slug, '--color-background-body', '#008080', {cwd});
  }
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('writing the page color', () => {
  it.each(['w', 'v', 'p'])('%s: every other surface keeps its colors', slug => {
    expect(valueOf(slug, '--color-background-body')[0]).toBe('#008080');
    expect(surfacesOf(slug)).toEqual(before[slug]);
  });

  it.each(['w', 'v'])('%s: text on a popover still reads', slug => {
    const text = parseColor(valueOf(slug, '--color-text-primary')[0]);
    const popover = parseColor(valueOf(slug, '--color-background-popover')[0]);
    expect(text && popover && ratio(text, popover)).toBeGreaterThanOrEqual(4.5);
  });
});
