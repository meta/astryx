// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * The colors a look grows (category and status colors) follow only the
 * look's own inputs, stay tints, and keep the base theme's values wherever a
 * base theme draws its own text with them and the grown value would not read.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
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

/** The resolved light and dark value of each token. @param {string} slug */
const resolved = async slug =>
  /** @type {Record<string, {light: string, dark: string}>} */ (
    /** @type {any} */ (await themeEditShow(slug, {cwd})).data.resolved
  );

/** @param {string} a @param {string} b */
const contrast = (a, b) =>
  ratio(
    /** @type {[number, number, number]} */ (parseColor(a)),
    /** @type {[number, number, number]} */ (parseColor(b)),
  );

const HUES = [
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'cyan',
  'blue',
  'purple',
  'pink',
  'gray',
];

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-look-pairs-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, [
    'neutral',
    'butter',
    'gothic',
  ]);
  if (unbuilt) throw new Error(unbuilt);
}, 1_500_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('the colors a look grows', () => {
  it("keep butter's coloured cards readable in dark, where butter draws dark text on them", async () => {
    await themeEditNew('bu', {cwd, like: 'butter'});
    const before = await resolved('bu');
    const r = /** @type {any} */ (
      await themeEditSet('bu', 'accent', '#2563eb', {cwd})
    );
    const after = await resolved('bu');
    for (const hue of HUES.filter(h => h !== 'gray'))
      expect(after[`--color-background-${hue}`]?.dark, hue).toBe(
        before[`--color-background-${hue}`]?.dark,
      );
    expect(r.data.notes.join('\n')).toMatch(
      /keep the base theme's where the base theme draws its own text with them/,
    );
    expect(
      (r.data.openProblems ?? []).filter((/** @type {any} */ p) =>
        /card/.test(String(p.problem)),
      ),
    ).toEqual([]);
  }, 240_000);

  it("keep gothic's Delete button readable in dark", async () => {
    await themeEditNew('go', {cwd, like: 'gothic'});
    const r = /** @type {any} */ (
      await themeEditSet('go', 'accent', '#7c3aed', {cwd})
    );
    const shown = /** @type {any} */ (await themeEditShow('go', {cwd})).data;
    const destructive = (/** @type {any[]} */ list) =>
      (list ?? []).filter(
        p =>
          /destructive/.test(JSON.stringify(p)) &&
          /\bdark\b/.test(JSON.stringify(p)),
      );
    expect(destructive(r.data.openProblems)).toEqual([]);
    expect(destructive(shown.openProblems ?? shown.problems)).toEqual([]);
  }, 240_000);

  it('never follow a link color set exactly into the fills', async () => {
    await themeEditNew('nb', {cwd, like: 'neutral'});
    const before = await resolved('nb');
    await themeEditSet('nb', '--color-text-accent', '#0d6efd', {
      cwd,
      mode: 'light',
    });
    const after = await resolved('nb');
    for (const hue of HUES)
      expect(after[`--color-background-${hue}`], hue).toEqual(
        before[`--color-background-${hue}`],
      );
  }, 240_000);

  it('stay as they are when only the page changes', async () => {
    await themeEditNew('pg', {cwd, like: 'neutral'});
    await themeEditSet('pg', 'accent', '#c2410c', {cwd});
    const before = await resolved('pg');
    await themeEditSet('pg', '--color-background-body', '#f5f0e6', {
      cwd,
      mode: 'light',
    });
    const after = await resolved('pg');
    for (const role of ['info', 'success', 'warning', 'error'])
      for (const k of [
        `--color-${role}`,
        `--color-on-${role}`,
        `--color-text-${role}`,
        `--color-${role}-muted`,
      ])
        expect(after[k], k).toEqual(before[k]);
    for (const hue of HUES)
      expect(after[`--color-background-${hue}`], hue).toEqual(
        before[`--color-background-${hue}`],
      );
  }, 240_000);

  it('a set on-accent reaches only what reads it, in its own mode', async () => {
    await themeEditNew('oa', {cwd, like: 'butter'});
    const before = await resolved('oa');
    await themeEditSet('oa', '--color-on-accent', '#111111', {
      cwd,
      mode: 'light',
    });
    const after = await resolved('oa');
    for (const k of Object.keys(before))
      if (k !== '--color-on-accent')
        expect(after[k]?.dark, k).toBe(before[k]?.dark);
  }, 240_000);
});
