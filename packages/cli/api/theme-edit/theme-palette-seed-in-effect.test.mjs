// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A color family whose fill the theme's own source sets exactly grows
 * its shades from that color, the one the fill shows: a set accent then
 * moves links, icons and the muted tint to shades of the source's color,
 * and the note about the source's color names a shade of it.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-palette-seed-in-effect-',
    FIXTURE_PACKAGES,
  );
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) return;
  await withAccent('t', "['#9333ea', '#d8b4fe']");
  await withAccent('u', "['rgb(147, 51, 234)', 'rgb(216, 180, 254)']");
}, 600_000);

/**
 * A new theme like neutral whose own source sets `--color-accent`.
 * @param {string} slug
 * @param {string} accent the token's value, as source text
 */
async function withAccent(slug, accent) {
  await themeEditNew(slug, {cwd, like: 'neutral'});
  await editSource(slug, text =>
    text.replace(
      `name: '${slug}',`,
      `name: '${slug}',\n  tokens: {'--color-accent': ${accent}},`,
    ),
  );
}

/**
 * Edits a theme's own source by hand and compiles it.
 * @param {string} slug
 * @param {(text: string) => string} edit
 */
async function editSource(slug, edit) {
  const file = path.join(cwd, `themes/${slug}/${slug}.theme.ts`);
  fs.writeFileSync(file, edit(fs.readFileSync(file, 'utf8')));
  await runCli(
    ['experimental', 'theme', 'compile', `themes/${slug}/${slug}.theme.ts`],
    {cwd},
  );
}

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} hex */
const hue = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (!d) return 0;
  const h =
    max === r
      ? ((g - b) / d) % 6
      : max === g
        ? (b - r) / d + 2
        : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};

describe('a family whose fill the source sets', () => {
  it('grows its link and icon shades from the source color', async () => {
    if (unbuilt) return;
    const r = /** @type {any} */ (
      await themeEditSet('t', 'accent', '#2563eb', {cwd})
    );
    const css = fs.readFileSync(path.join(cwd, 'themes/t/t.css'), 'utf8');
    const text = /--color-text-accent:\s*light-dark\((#[0-9a-f]{6}),/i.exec(
      css,
    )?.[1];
    expect(text).toBeDefined();
    // (Purple, as #9333ea is, never the blue of the dial value.)
    expect(hue(String(text))).toBeGreaterThan(250);
    expect(hue(String(text))).toBeLessThan(300);
    const note = (r.data?.notes ?? []).find((/** @type {string} */ n) =>
      /your exact color \(#9333ea\)/.test(n),
    );
    expect(note).toBeDefined();
    const shade = /\((#[0-9a-f]{6})\), the nearest that reads/.exec(
      String(note),
    )?.[1];
    expect(hue(String(shade))).toBeGreaterThan(250);
    expect(hue(String(shade))).toBeLessThan(300);
  }, 240_000);

  it('names no replaced seed when only the source fill changed since', async () => {
    if (unbuilt) return;
    await editSource('t', text =>
      text.replace("['#9333ea', '#d8b4fe']", "['#16a34a', '#86efac']"),
    );
    const r = /** @type {any} */ (
      await themeEditSet('t', 'accent', '#2563eb', {cwd})
    );
    const notes = /** @type {string[]} */ (r.data?.notes ?? []);
    expect(notes.filter(n => /seed .* is replaced by/.test(n))).toEqual([]);
    const css = fs.readFileSync(path.join(cwd, 'themes/t/t.css'), 'utf8');
    const text = /--color-text-accent:\s*light-dark\((#[0-9a-f]{6}),/i.exec(
      css,
    )?.[1];
    // (Green, as #16a34a is.)
    expect(hue(String(text))).toBeGreaterThan(100);
    expect(hue(String(text))).toBeLessThan(170);
  }, 240_000);

  it('reads a pair written with rgb() colors', async () => {
    if (unbuilt) return;
    await themeEditSet('u', 'accent', '#2563eb', {cwd});
    const css = fs.readFileSync(path.join(cwd, 'themes/u/u.css'), 'utf8');
    const text = /--color-text-accent:\s*light-dark\((#[0-9a-f]{6}),/i.exec(
      css,
    )?.[1];
    expect(text).toBeDefined();
    expect(hue(String(text))).toBeGreaterThan(250);
    expect(hue(String(text))).toBeLessThan(300);
  }, 240_000);

  it('drops a gray kind the editor wrote without blaming the author', async () => {
    if (unbuilt) return;
    await themeEditNew('g', {cwd, like: 'neutral'});
    await themeEditSet('g', 'accent', '#808080', {cwd});
    const r = /** @type {any} */ (
      await themeEditSet('g', 'accent', '#2563eb', {cwd})
    );
    const notes = /** @type {string[]} */ (r.data?.notes ?? []);
    expect(notes.filter(n => /kind "neutral" is dropped/.test(n))).toEqual([]);
    expect(notes.filter(n => /seed .* is replaced by/.test(n))).toEqual([]);
  }, 240_000);

  it('says the source color sets every shade when the setting changes', async () => {
    if (unbuilt) return;
    const r = /** @type {any} */ (
      await themeEditSet('t', 'accent', '#dc2626', {cwd})
    );
    const notes = /** @type {string[]} */ (r.data?.notes ?? []);
    expect(
      notes.filter(n =>
        /sets --color-accent itself, and every accent shade/.test(n),
      ),
    ).toHaveLength(1);
    expect(notes.filter(n => /the theme already shows/.test(n))).toEqual([]);
  }, 240_000);

  it('takes vibrancy when only the source fill has a hue', async () => {
    if (unbuilt) return;
    await withAccent('x', "'#9333ea'");
    await themeEditSet('x', 'neutral', '#808080', {cwd});
    await themeEditSet('x', 'accent', '#7f7f7f', {cwd});
    await expect(
      themeEditSet('x', 'vibrancy', '90', {cwd}),
    ).resolves.toBeTruthy();
  }, 240_000);

  it('names the source color on a first set, which does change the shades', async () => {
    if (unbuilt) return;
    await withAccent('y', "['#9333ea', '#d8b4fe']");
    const r = /** @type {any} */ (
      await themeEditSet('y', 'accent', '#2563eb', {cwd})
    );
    const notes = /** @type {string[]} */ (r.data?.notes ?? []);
    const note = notes.find(n => /grows from its color, #9333ea/.test(n));
    expect(note).toBeDefined();
    expect(String(note)).not.toMatch(/changes nothing you see/);
  }, 240_000);

  it('names a gray source fill when it refuses vibrancy', async () => {
    if (unbuilt) return;
    await withAccent('z', "'#808080'");
    await themeEditSet('z', 'neutral', '#808080', {cwd});
    await themeEditSet('z', 'accent', '#9333ea', {cwd});
    await expect(themeEditSet('z', 'vibrancy', '90', {cwd})).rejects.toThrow(
      /z\.theme\.ts wins over the setting for accent/,
    );
  }, 240_000);

  it('says nothing about the screen when there is no last build to compare', async () => {
    if (unbuilt) return;
    await withAccent('q', "['#9333ea', '#d8b4fe']");
    fs.rmSync(path.join(cwd, 'themes/q/q.js'), {force: true});
    const r = /** @type {any} */ (
      await themeEditSet('q', 'accent', '#2563eb', {cwd})
    );
    const notes = /** @type {string[]} */ (r.data?.notes ?? []);
    const note = notes.find(n => /grows from its color, #9333ea/.test(n));
    expect(note).toBeDefined();
    expect(String(note)).not.toMatch(/changes nothing you see/);
  }, 240_000);
});
