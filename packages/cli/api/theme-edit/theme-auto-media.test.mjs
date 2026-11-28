// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A toast's text takes the side Core's own rule takes on the fill
 * the toast draws (the theme's text where it reads at 3:1, else an
 * on-color; a gradient falls back from the inverted surface), and the
 * pictures and the checks take the same side; a transparent button on a
 * lightbox's dark island is measured on that island; the parts drawn open
 * keep the custom properties React gave them, and a plain element in a
 * doc example draws.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {autoMediaSide} from './_settings.mjs';
import {chartDocument} from '../../foundation/render/charts.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';
import {realRenders} from '../../test-utils/theme-render-stub.mjs';

// (These cases read the drawn pages, their pictures or what a drawing
// reports: drawn for real.)
realRenders(true);

const T = 400_000;
/** @type {string} */
let cwd;
/** @type {string} */
let unbuilt = '';
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-auto-media-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  unbuilt = await installRealBaseThemes(cwd, ['neutral', 'stone']);
}, T);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

const LIGHT = {
  '--color-background-body': '#ffffff',
  '--color-text-primary': '#000000',
  '--color-on-dark': '#ffffff',
  '--color-on-light': '#111111',
  '--color-background-inverted': '#0a1317',
  '--color-background-error-inverted': '#aa071e',
};
const DARK = {
  ...LIGHT,
  '--color-background-body': '#000000',
  '--color-text-primary': '#ffffff',
  '--color-background-inverted': '#f1f1f1',
};

describe("Core's media side", () => {
  it('keeps the theme text where it reads at 3:1, else the better on-color', () => {
    expect(autoMediaSide('#808080', DARK, {mode: 'dark'})).toBe('off');
    expect(autoMediaSide('#1e3a8a', LIGHT, {mode: 'light'})).toBe('dark');
    // A see-through fill is composited onto the page first.
    expect(autoMediaSide('rgba(255,255,255,0.2)', LIGHT, {mode: 'light'})).toBe(
      'off',
    );
    // A gradient cannot be read: the inverted surface decides.
    expect(
      autoMediaSide('linear-gradient(#fff, #fef08a)', LIGHT, {mode: 'light'}),
    ).toBe('dark');
    expect(
      autoMediaSide('linear-gradient(#fff, #fef08a)', DARK, {mode: 'dark'}),
    ).toBe('light');
  });
});

/** @param {string} slug */
const toastSides = slug => {
  const html = fs.readFileSync(
    path.join(cwd, `themes/${slug}/sheet.html`),
    'utf8',
  );
  return [
    ...html.matchAll(
      /(<[a-z]+\b[^>]*class="astryx-toast[ "][^>]*>)\s*<div([^>]*)>/g,
    ),
  ].map(m => /data-astryx-media="(\w+)"/.exec(m[2])?.[1] ?? 'off');
};
/** @param {string} slug */
const toastProblems = async slug =>
  /** @type {Array<{problem: string, fix: string | null}>} */ (
    /** @type {any} */ (await themeEditShow(slug, {cwd})).data.openProblems
  ).filter(p => /text in toast/.test(p.problem));

describe("a toast's text", () => {
  it(
    'on a mid-grey fill: the theme text, a 3.95:1 problem in dark with a color line',
    async () => {
      await themeEditNew('g', {cwd, like: 'neutral'});
      await themeEditSet('g', 'background-color', '#808080', {
        cwd,
        on: 'toast',
      });
      const p = await toastProblems('g');
      expect(p.map(x => x.problem).join('\n')).toMatch(/3\.94:1 in dark/);
      expect(p[0].fix).toMatch(/set g color '#000000' --on toast --mode dark/);
      expect(new Set(toastSides('g'))).toEqual(new Set(['off']));
    },
    T,
  );

  it(
    'on a see-through fill: the theme text in both modes, no problem',
    async () => {
      await themeEditNew('w', {cwd, like: 'neutral'});
      await themeEditSet('w', 'background-color', 'rgba(255,255,255,0.2)', {
        cwd,
        on: 'toast',
      });
      expect(await toastProblems('w')).toEqual([]);
      expect(new Set(toastSides('w'))).toEqual(new Set(['off']));
    },
    T,
  );

  it(
    'on a gradient: the fallback side, its problem in light, with a line set takes',
    async () => {
      await themeEditNew('l', {cwd, like: 'neutral'});
      await themeEditSet(
        'l',
        'background',
        'linear-gradient(#ffffff,#fef08a)',
        {
          cwd,
          on: 'toast',
        },
      );
      const p = await toastProblems('l');
      const light = p.find(x => / in light /.test(x.problem));
      expect(light?.fix).toMatch(
        /set l color '#000000' --on toast --mode light$/,
      );
      await themeEditSet('l', 'color', '#000000', {
        cwd,
        on: 'toast',
        mode: 'light',
      });
      expect(
        (await toastProblems('l')).some(x => / in light /.test(x.problem)),
      ).toBe(false);
    },
    T,
  );
});

describe('a transparent secondary button on a lightbox', () => {
  it(
    'is measured on the dark island, not the page',
    async () => {
      if (unbuilt) return;
      await themeEditNew('s', {cwd, like: 'stone'});
      const open = /** @type {any} */ (await themeEditShow('s', {cwd})).data
        .openProblems;
      expect(
        open.filter((/** @type {any} */ p) => / on lightbox /.test(p.problem)),
      ).toEqual([]);
    },
    T,
  );
});

describe('parts drawn open', () => {
  it('keep a custom property name as React set it', async () => {
    await chartDocument();
    const el = /** @type {any} */ (globalThis).document.createElement('div');
    el.style.setProperty('--x-aspectRatio', '1.77');
    el.style.setProperty('margin-top', '2px');
    expect(el.outerHTML).toContain('--x-aspectRatio:1.77');
    expect(el.style.getPropertyValue('--x-aspectRatio')).toBe('1.77');
  });

  it(
    "draw the overlay's media example",
    async () => {
      await themeEditNew('o', {cwd, like: 'neutral'});
      await themeEditShow('o', {cwd, section: 'overlays'});
      const html = fs.readFileSync(
        path.join(cwd, 'themes/o/sheet-overlays.html'),
        'utf8',
      );
      expect(html).toContain('Media preview');
      expect(html).toContain('--x-aspectRatio');
      expect(html).not.toMatch(/--x-aspect-ratio/);
    },
    T,
  );
});
