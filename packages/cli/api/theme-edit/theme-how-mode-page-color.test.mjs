// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A hue said for one mode's page ("dark mode should be a deep dark plum",
 * "light mode is pale blush", "dark mode goes near-black with a purple
 * tint") is that mode's page in the color's hue at the page's own
 * lightness there, so the grounds follow it; never a theme of one mode or
 * an accent. A mid tone named for a mode's background (chocolate brown)
 * takes that lightness too, its hue kept. "<color> everything" is the
 * page. Asks that read right before stay as they were.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew} from './theme-edit.mjs';
import {colorsSaidForPages} from './_normal.mjs';
import {hexToOklch} from '../theme/palette/generate/color.mjs';
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
/** Why a bundled theme could not be installed here, when it could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-mode-page-color-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (!unbuilt) await themeEditNew('c', {cwd, like: 'neutral'});
}, 600_000);

afterAll(() => removeLinkedFixture(cwd));

/** @param {import('vitest').TestContext} test */
const needsBases = test => {
  if (unbuilt) {
    console.warn(`skipped: ${unbuilt}`);
    test.skip();
  }
};

/**
 * The set lines the first answer writes, without the command's prefix.
 * @param {string} q
 * @returns {Promise<string[]>}
 */
const first = async q => {
  const {data} = await themeEditHow(q, {cwd, theme: 'c'});
  return /** @type {string[]} */ (data.results?.[0]?.commands ?? [])
    .flatMap(x => String(x).split(' && '))
    .map(x => x.replace(/^.* editor /, '').replace(/^set c /, ''));
};

/**
 * The page color a line set writes for a mode.
 * @param {string[]} lines @param {'light' | 'dark'} mode
 */
const pageIn = (lines, mode) =>
  new RegExp(`^--color-background-body '(#[0-9a-f]{6})' --mode ${mode}$`).exec(
    lines.find(l => l.includes(`--mode ${mode}`)) ?? '',
  )?.[1] ?? null;

/** @param {string} a @param {string} b */
const hueGap = (a, b) =>
  Math.abs(((hexToOklch(a).H - hexToOklch(b).H + 540) % 360) - 180);

const T = 300_000;

describe('a color said for one mode is its page', () => {
  it(
    'a deep dark plum dark mode: the dark page, light mode kept, never dark-only',
    async test => {
      needsBases(test);
      const lines = await first('dark mode should be a deep dark plum');
      expect(lines.join('\n')).not.toMatch(/\bmode dark-only\b|--color-accent/);
      const dark = /** @type {string} */ (pageIn(lines, 'dark'));
      expect(hueGap(dark, '#7e22ce')).toBeLessThan(15);
      expect(hexToOklch(dark).L).toBeLessThan(0.3);
      expect(pageIn(lines, 'light')).toBeNull();
    },
    T,
  );

  it(
    'pale blush light, near-black with a purple tint dark: both pages, in their hues',
    async test => {
      needsBases(test);
      const lines = await first(
        'light mode is pale blush, dark mode goes near-black with a purple tint',
      );
      const light = /** @type {string} */ (pageIn(lines, 'light'));
      const dark = /** @type {string} */ (pageIn(lines, 'dark'));
      expect(hueGap(light, '#f4c2c2')).toBeLessThan(20);
      expect(hexToOklch(light).L).toBeGreaterThan(0.9);
      expect(hueGap(dark, '#7c3aed')).toBeLessThan(20);
      expect(hexToOklch(dark).L).toBeLessThan(0.3);
    },
    T,
  );

  it(
    'blush pink everything with raspberry accents, dark plum dark mode: the pages and the accent',
    async test => {
      needsBases(test);
      const lines = await first(
        'soft blush pink everything with deep raspberry accents. dark mode should go dark plum, with pink highlights',
      );
      const light = /** @type {string} */ (pageIn(lines, 'light'));
      expect(hexToOklch(light).L).toBeGreaterThan(0.9);
      expect(hexToOklch(light).C).toBeGreaterThan(0.005);
      expect(lines.some(l => /^accent '#/.test(l))).toBe(true);
      // (The plum said for dark mode is its page, written after the blush.)
      const darks = lines
        .filter(l => /^--color-background-body .* --mode dark$/.test(l))
        .map(l => /'(#[0-9a-f]{6})'/.exec(l)?.[1] ?? '');
      expect(hueGap(darks[darks.length - 1], '#7e22ce')).toBeLessThan(15);
    },
    T,
  );

  it(
    'a deep navy-indigo dark mode, and a chocolate brown one at the dark page lightness with its hue',
    async test => {
      needsBases(test);
      const navy = pageIn(
        await first('dark mode goes deep navy-indigo'),
        'dark',
      );
      expect(navy).not.toBeNull();
      expect(hexToOklch(String(navy)).L).toBeLessThan(0.3);
      const brown = pageIn(
        await first(
          'cream/beige background, dark mode should be chocolate brown',
        ),
        'dark',
      );
      expect(hexToOklch(String(brown)).L).toBeLessThan(0.3);
      expect(hueGap(String(brown), '#92400e')).toBeLessThan(15);
    },
    T,
  );

  it('reads only a hue said by itself, ending its clause, as the page', () => {
    const isShade = (/** @type {string} */ w) =>
      /^(?:lighter|light|pale|pastel|darker|dark|deeper|deep|rich|subtle|soft)$/.test(
        w,
      );
    const isHue = (/** @type {string} */ w) =>
      /^(?:red|blue|gray|grey|purple|plum|cream|navy|pink|blush|black|brown|slate)$/.test(
        w,
      );
    for (const ask of [
      'dark mode gets a red accent',
      'light mode gets blue links',
      'dark mode should be red for errors',
      'light mode gets a gray border',
      'dark mode turns the buttons blue',
      'use the same blue for everything',
      'blue on everything',
      'navy across everything',
      'light mode should be cream with blue buttons',
      'dark mode should be slate with rounder buttons',
      'dark mode is navy and light mode is cream',
      'dark mode is gray',
      'header navy, gray everything else',
      'buttons in dark mode should be blue',
      'the accent in dark mode should be purple',
      'rounder corners and blush pink everything',
      'warm beige everything',
      'cool blue everything',
      'dark mode is cool navy',
      'light mode is warm beige',
      'dark mode is midnight navy',
      'dark mode is a dusty plum',
      'dark mode is bright red',
    ])
      expect(colorsSaidForPages(ask, isHue, isShade), ask).toBe(ask);
    expect(
      colorsSaidForPages('soft blush pink everything', isHue, isShade),
    ).toBe('soft blush pink page');
    expect(
      colorsSaidForPages(
        'dark mode is navy. light mode is cream',
        isHue,
        isShade,
      ),
    ).toBe('dark mode: page navy. light mode: page cream');
    // (A line of the ask, or a list item, is a clause start.)
    expect(
      colorsSaidForPages(
        'calm and minimal\n- dark mode should be a deep dark plum',
        isHue,
        isShade,
      ),
    ).toBe('calm and minimal\n- dark mode: page deep dark plum');
    // (The color reader's shade words count as tone words too.)
    expect(
      colorsSaidForPages('light mode is pastel pink', isHue, isShade),
    ).toBe('light mode: page pastel pink');
  });

  it(
    'keeps the mode on what follows the page: gold buttons and blue links in dark mode only',
    async test => {
      needsBases(test);
      for (const ask of [
        'dark mode is plum, gold buttons',
        'dark mode is plum. gold buttons',
        'dark mode is plum; gold buttons',
        'light mode is pale blush, dark mode is plum, gold buttons',
      ]) {
        const lines = await first(ask);
        const buttons = lines.filter(l => /--on button\b/.test(l));
        expect(buttons.length, ask).toBeGreaterThan(0);
        for (const l of buttons) expect(l, ask).toMatch(/--mode dark$/);
        expect(pageIn(lines, 'dark'), ask).not.toBeNull();
      }
      // (A nearer mode said for a part, not a page, ends the page's run:
      // the blue links are not kept to light mode.)
      const nearer = /** @type {string[]} */ (
        (
          await themeEditHow(
            'light mode is pale blush, dark mode gets gold buttons, blue links',
            {cwd, theme: 'c'},
          )
        ).data.results ?? []
      ).flatMap(r => r.commands ?? []);
      const nearerAccent = nearer.filter(l =>
        /--color-text-accent/.test(String(l)),
      );
      expect(nearerAccent.length).toBeGreaterThan(0);
      for (const l of nearerAccent)
        expect(String(l)).not.toMatch(/--mode light$/);
      // (A typed head scopes its whole sentence, as before: the buttons
      // after a light-mode clause stay dark.)
      const typed = /** @type {string[]} */ (
        (
          await themeEditHow(
            'dark mode: page #111111, cards #222222, borders #333333 in light mode, buttons #444444',
            {cwd, theme: 'c'},
          )
        ).data.results ?? []
      )
        .flatMap(r => r.commands ?? [])
        .filter(l => /'#444444' --on button/.test(String(l)));
      expect(typed.length).toBeGreaterThan(0);
      for (const l of typed) expect(String(l)).toMatch(/--mode dark$/);
      for (const ask of [
        'dark-mode: page #111111, cards #222222, borders #333333 in light mode, buttons #444444',
        'dark mode: page #111111, cards #222222, light mode: page #eeeeee, buttons #444444',
        'dark mode: page near-black, cards #222222, borders #333333 in light mode, buttons #444444',
        'Can you do this? dark mode: page #111111, cards #222222, borders #333333 in light mode, buttons #444444',
      ]) {
        const lines = /** @type {string[]} */ (
          (await themeEditHow(ask, {cwd, theme: 'c'})).data.results ?? []
        )
          .flatMap(r => r.commands ?? [])
          .filter(l => /'#444444' --on button/.test(String(l)));
        expect(lines.length, ask).toBeGreaterThan(0);
        for (const l of lines) expect(String(l), ask).toMatch(/--mode dark$/);
      }
      const links = await first('dark mode is navy, with blue links');
      const accent = links.filter(l => /--color-text-accent/.test(l));
      expect(accent.length).toBeGreaterThan(0);
      for (const l of accent) expect(l).toMatch(/--mode dark$/);
    },
    T,
  );

  it(
    'a page said for one mode keeps its mode beside an ask said for both modes',
    async test => {
      needsBases(test);
      const lines = /** @type {string[]} */ (
        (
          await themeEditHow('dark mode is navy, same accent in both modes', {
            cwd,
            theme: 'c',
          })
        ).data.results ?? []
      )
        .flatMap(r => r.commands ?? [])
        .map(x =>
          String(x)
            .replace(/^.* editor /, '')
            .replace(/^set c /, ''),
        );
      // (The navy is the dark page, toned; the light page is untouched.)
      expect(pageIn(lines, 'dark')).not.toBeNull();
      expect(pageIn(lines, 'dark')).not.toBe('#1e3a8a');
      expect(lines.some(l => /^--color-background-body '[^']+'$/.test(l))).toBe(
        false,
      );
    },
    T,
  );

  it(
    'reads "bluish" as bluish, never as the new blush',
    async test => {
      needsBases(test);
      const page = pageIn(await first('make the page bluish'), 'light');
      if (page) expect(hueGap(page, '#f4c2c2')).toBeGreaterThan(40);
    },
    T,
  );

  it(
    'reads a beige page, a warm off-white light page, a brown-black dark mode and a navy-blue background',
    async test => {
      needsBases(test);
      expect(pageIn(await first('beige page'), 'light')).toBe('#f5f5dc');
      const warm = await first('warm off-white page. dark mode is brown-black');
      expect(pageIn(warm, 'light')).toBe('#faf8f3');
      expect(pageIn(warm, 'dark')).not.toBeNull();
      const navy = await first(
        'dark near-black dashboard, background navy-blue',
      );
      expect(pageIn(navy, 'light')).not.toBeNull();
      expect(pageIn(navy, 'dark')).not.toBeNull();
    },
    T,
  );
});
