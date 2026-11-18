// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A token family follows the token it is made from: the fills made
 * from the surface (cards, popovers, the muted fill, code blocks,
 * skeletons) follow a surface the theme sets, the emphasized border
 * follows an opaque border, and the neutral color reaches the page; a
 * pinned token always wins.
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
import {oklabCoordinates} from '../theme/palette/generate/color.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

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
  const v = new RegExp(`\\s${token}:\\s*([^;]+);`).exec(css)?.[1]?.trim() ?? '';
  const pair = /^light-dark\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)$/.exec(v);
  return pair
    ? [pair[1].toLowerCase(), pair[2].toLowerCase()]
    : [v.toLowerCase(), v.toLowerCase()];
};

const FAMILY = [
  '--color-background-card',
  '--color-background-popover',
  '--color-background-muted',
  '--color-syntax-background',
  '--color-skeleton',
];

/** @type {Record<string, [string, string]>} */
const plain = {};

beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-token-family-follows-fills-',
    FIXTURE_PACKAGES,
  );
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
  await themeEditNew('base', {cwd, like: 'neutral'});
  for (const k of [...FAMILY, '--color-background-body'])
    plain[k] = valueOf('base', k);
  // A gray surface written for light mode (with and without a neutral
  // color), and one theme that pins its cards.
  await themeEditNew('w', {cwd, like: 'neutral'});
  await themeEditSet('w', 'neutral', '#808080', {cwd});
  await themeEditSet('w', '--color-background-surface', '#c0c0c0', {
    cwd,
    mode: 'light',
  });
  await themeEditNew('x', {cwd, like: 'neutral'});
  await themeEditSet('x', '--color-background-surface', '#c0c0c0', {
    cwd,
    mode: 'light',
  });
  await themeEditSet('x', '--color-background-card', '#ffffff', {cwd});
  // An opaque border, one translucent border, and one pinned emphasized.
  // A dark-only theme with its own page and surface.
  await themeEditNew('pm', {
    cwd,
    like: 'neutral',
    settings: {mode: 'dark-only'},
  });
  await themeEditSet('pm', '--color-background-body', '#0f1014', {cwd});
  await themeEditSet('pm', '--color-background-surface', '#16181d', {cwd});
  await themeEditNew('b', {cwd, like: 'neutral'});
  await themeEditSet('b', '--color-border', '#000000', {cwd});
  await themeEditNew('t', {cwd, like: 'neutral'});
  await themeEditSet('t', '--color-border', '#0000003d', {cwd});
  await themeEditNew('e', {cwd, like: 'neutral'});
  await themeEditSet('e', '--color-border', '#000000', {cwd});
  await themeEditSet('e', '--color-border-emphasized', '#777777', {cwd});
  // A warm neutral color, and one with the page set exactly.
  await themeEditNew('warm', {cwd, like: 'neutral'});
  await themeEditSet('warm', 'neutral', '#78716c', {cwd});
  await themeEditNew('page', {cwd, like: 'neutral'});
  await themeEditSet('page', 'neutral', '#78716c', {cwd});
  await themeEditSet('page', '--color-background-body', '#008080', {cwd});
}, 900_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('the fills made from the surface', () => {
  it.each(['w', 'x'])('%s: follow a surface set for light mode', slug => {
    expect(valueOf(slug, '--color-background-surface')[0]).toBe('#c0c0c0');
    // Cards and popovers sit on the surface's own color in neutral.
    expect(valueOf(slug, '--color-background-popover')[0]).toBe('#c0c0c0');
    // The muted fill, the code block and the skeleton keep their step
    // from it: darker than the surface, never the base's own color.
    for (const k of [
      '--color-background-muted',
      '--color-syntax-background',
      '--color-skeleton',
    ]) {
      const [light] = valueOf(slug, k);
      expect(light, k).not.toBe(plain[k][0]);
      expect(light, k).toMatch(/^#[0-9a-f]{6}$/);
    }
    // The dark half is not touched.
    for (const k of FAMILY)
      if (slug === 'x' && k === '--color-background-card') continue;
      else expect(valueOf(slug, k)[1], k).toBe(plain[k][1]);
  });

  it('a fill the base keeps between page and surface never passes the page', () => {
    // Neutral's dark cards, popovers and muted fill are its page's shade:
    // with a page and a surface set, their measured lightness stays from
    // the page's up to the surface's, never darker than the page.
    /** @param {string} color */
    const lightness = color => oklabCoordinates(color)[0];
    const page = lightness(valueOf('pm', '--color-background-body')[1]);
    const surface = lightness(valueOf('pm', '--color-background-surface')[1]);
    for (const k of [
      '--color-background-card',
      '--color-background-popover',
      '--color-background-muted',
    ]) {
      const v = lightness(valueOf('pm', k)[1]);
      expect(v, k).toBeGreaterThanOrEqual(page);
      expect(v, k).toBeLessThanOrEqual(surface);
    }
  });

  it('a pinned card keeps its color', () => {
    expect(valueOf('w', '--color-background-card')[0]).toBe('#c0c0c0');
    expect(valueOf('x', '--color-background-card')).toEqual([
      '#ffffff',
      '#ffffff',
    ]);
  });
});

describe('the emphasized border', () => {
  it('follows an opaque border where that is stronger', () => {
    // Black is stronger than the emphasized border on the light surface,
    // fainter on the dark one, where the emphasized border keeps its own.
    const [light, dark] = valueOf('b', '--color-border-emphasized');
    expect(light).toBe('#000000');
    expect(dark).toBe(valueOf('base', '--color-border-emphasized')[1]);
  });

  it('keeps its own color beside a translucent border, or when pinned', () => {
    expect(valueOf('t', '--color-border-emphasized')).toEqual(
      valueOf('base', '--color-border-emphasized'),
    );
    expect(valueOf('e', '--color-border-emphasized')[0]).toBe('#777777');
  });
});

describe('the neutral color and the page', () => {
  it('reaches the page, as it reaches the cards', () => {
    const [light, dark] = valueOf('warm', '--color-background-body');
    expect(light).not.toBe(plain['--color-background-body'][0]);
    expect(dark).not.toBe(plain['--color-background-body'][1]);
    // At the official step: the muted fill shares the page's stop.
    expect(light).toBe(valueOf('warm', '--color-background-muted')[0]);
  });

  it('a page color set exactly wins', () => {
    expect(valueOf('page', '--color-background-body')[0]).toBe('#008080');
  });
});
