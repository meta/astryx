// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `surfaces flat` keeps its tinted panel, and the gray pieces inside
 * a panel drawn in the tint's color (a neutral badge, a track) are drawn in
 * the panel's own surface there instead; colored fills keep their hue, and
 * the emphasized border stands out from the tint at least as much as it
 * does from the panel's surface.
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

/** The card's base rule in a theme's built CSS. @param {string} slug */
const cardRule = slug => {
  const css = fs.readFileSync(
    path.join(cwd, 'themes', slug, `${slug}.css`),
    'utf8',
  );
  return /\n {2}\.astryx-card \{([^}]*)\}/.exec(css)?.[1] ?? '';
};
/** @param {string} rule @param {string} prop */
const valueIn = (rule, prop) =>
  new RegExp(`(?:^|;|\\s)${prop}:\\s*([^;]+);`).exec(rule)?.[1]?.trim() ?? '';
/** The light half of a light-dark() pair, or the value. @param {string} v */
const light = v =>
  /^light-dark\(\s*([^,]+?)\s*,/.exec(v)?.[1]?.trim().toLowerCase() ??
  v.toLowerCase();
/** @param {string} c */
const rgb = c => /** @type {[number, number, number]} */ (parseColor(c));

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-d-flat-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, ['neutral', 'stone']);
  if (unbuilt) throw new Error(unbuilt);
  for (const like of ['neutral', 'stone']) {
    await themeEditNew(`f${like}`, {cwd, like});
    await themeEditSet(`f${like}`, 'surfaces', 'flat', {cwd});
  }
  // White cards in light mode, then flat: the light cards show white.
  await themeEditNew('white', {cwd, like: 'neutral'});
  await themeEditSet('white', 'background-color', '#ffffff', {
    cwd,
    on: 'card',
    mode: 'light',
  });
  await themeEditSet('white', 'surfaces', 'flat', {cwd});
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('surfaces flat', () => {
  it.each(['neutral', 'stone'])(
    '%s: keeps the tinted panel and draws its muted fill in the card surface',
    slug => {
      const rule = cardRule(`f${slug}`);
      expect(light(valueIn(rule, 'background-color'))).toMatch(
        /^#[0-9a-f]{6}$/,
      );
      expect(valueIn(rule, '--color-background-muted')).toBe(
        'var(--color-background-card)',
      );
    },
  );

  it('stone: the gray badge and track fills take the card surface; colored fills keep their hue', () => {
    const rule = cardRule('fstone');
    expect(light(valueIn(rule, '--color-background-gray'))).toBe(
      'var(--color-background-card)',
    );
    expect(light(valueIn(rule, '--color-skeleton'))).toBe(
      'var(--color-background-card)',
    );
    for (const hue of ['blue', 'green', 'red', 'yellow'])
      expect(valueIn(rule, `--color-background-${hue}`), hue).toBe('');
  });

  it('a panel with a fill of its own in a mode keeps its pieces there', () => {
    const rule = cardRule('white');
    // Light shows the white card: the gray badge keeps its own pill.
    expect(valueIn(rule, '--color-background-gray')).toBe('');
    expect(light(valueIn(rule, '--color-background-muted'))).not.toBe(
      'var(--color-background-card)',
    );
  });

  it('neutral: the emphasized border stands out from the tint at least as from the card', () => {
    const rule = cardRule('fneutral');
    const tint = light(valueIn(rule, 'background-color'));
    const stepped = light(valueIn(rule, '--color-border-emphasized'));
    expect(stepped).toMatch(/^#[0-9a-f]{6}$/);
    // Neutral light: the emphasized border is #d4d4d4 on the white card.
    expect(ratio(rgb(stepped), rgb(tint))).toBeGreaterThanOrEqual(
      ratio(rgb('#d4d4d4'), rgb('#ffffff')),
    );
  });
});
