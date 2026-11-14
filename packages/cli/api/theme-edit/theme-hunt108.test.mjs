// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how` on bundled bases with rules of their own: an except
 * keeps what the part shows (corners drawn from a token, heading levels, a
 * hover fill under its tint), a one-mode theme answers only for the mode it
 * shows, gradients keep the colors named, steps start from what the theme
 * shows (text size, a variant's own fill, a pill radius), a comparison holds
 * its reference, removals distribute over "the card border and shadow",
 * bounds are targets, and a color clause continues the ask before it.
 *
 * @position api/theme-edit — tests
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

/** @type {string} */
let cwd;
/** Why a bundled base could not be installed here, when one could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt108-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('q', {cwd, like: 'neutral'});
  await themeEditNew('lo', {cwd, like: 'neutral'});
  await themeEditSet('lo', 'mode', 'light-only', {cwd});
  await themeEditNew('do', {cwd, like: 'neutral'});
  await themeEditSet('do', 'mode', 'dark-only', {cwd});
  unbuilt = await installRealBaseThemes(cwd, ['butter', 'y2k']);
  if (!unbuilt) {
    await themeEditNew('b', {cwd, like: 'butter'});
    await themeEditNew('y', {cwd, like: 'y2k'});
  }
}, 600_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** @param {string} q @param {string} [theme] */
const answer = async (q, theme = 'q') => {
  const {data} = await themeEditHow(q, {cwd, theme});
  const results = data.results ?? [];
  return {
    first: (
      results.find(r => r.commands.some(c => / editor set /.test(c)))
        ?.commands ?? []
    ).map(c => c.replace(/^.* editor /, '')),
    text: results.map(r => r.text).join('\n'),
  };
};

/** @param {import('vitest').TestContext} test */
const needsBases = test => {
  if (unbuilt) {
    console.warn(`skipped: ${unbuilt}`);
    test.skip();
  }
};

/** @param {string} hex */
const lum = hex => {
  const n = Number.parseInt(hex.replace('#', '').slice(0, 6), 16);
  return (
    ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114
  );
};

const T = 120_000;

describe('wrong writes that are no longer accepted', () => {
  it(
    'an except of buttons keeps the corner token, not a radius over the group joins',
    async () => {
      const {first} = await answer(
        'make everything rounder except buttons and cards',
      );
      expect(first).toContain('set q corners more');
      expect(
        first.some(c => /^set q --radius-element \S+ --on button$/.test(c)),
      ).toBe(true);
      expect(first.some(c => /border-radius .* --on button/.test(c))).toBe(
        false,
      );
    },
    T,
  );
  it(
    'a light-only theme says it has no dark mode for a dark shadow ask',
    async () => {
      const r = await answer('make shadows darker in dark mode', 'lo');
      expect(r.first).toEqual([]);
      expect(r.text).toMatch(/has only a light mode/);
    },
    T,
  );
  it(
    'a dark-only theme answers "in dark mode" with the change alone',
    async () => {
      const {first} = await answer(
        'in dark mode, cards should be #1c1c1e',
        'do',
      );
      expect(first.length).toBeGreaterThan(0);
      expect(first.some(c => / mode both$/.test(c))).toBe(false);
    },
    T,
  );
  it(
    'butter: an except of headings keeps each level its own weight',
    async test => {
      needsBases(test);
      const {first} = await answer('make all text bolder except headings', 'b');
      expect(first).toContain(
        'set b font-weight 700 --on heading --when level:3',
      );
      expect(first).toContain(
        'set b font-weight 700 --on heading --when level:4',
      );
    },
    T,
  );
  it(
    'butter: a darker destructive button steps from the fill it shows',
    async test => {
      needsBases(test);
      const {first} = await answer('make every button background darker', 'b');
      const light = first.find(c =>
        /--when variant:destructive --mode light$/.test(c),
      );
      const hex = /'(#[0-9a-f]{6})'/.exec(light ?? '')?.[1];
      expect(hex).toBeTruthy();
      expect(lum(String(hex))).toBeLessThan(lum('#ffd9cf'));
      expect(lum(String(hex))).toBeGreaterThan(lum('#ffd9cf') - 40);
    },
    T,
  );
  it(
    'butter: darker than the page never leaves the card lighter than the page',
    async test => {
      needsBases(test);
      const {first} = await answer('make cards darker than the page', 'b');
      const dark = first.find(c =>
        /--on card --when variant:default --mode dark$/.test(c),
      );
      if (dark)
        expect(lum(String(/'(#[0-9a-f]{6})'/.exec(dark)?.[1]))).toBeLessThan(
          lum('#261a13'),
        );
    },
    T,
  );
  it(
    'a gradient takes the colors named, in order',
    async () => {
      expect(
        (await answer('make the header a blue to purple gradient')).first[0],
      ).toBe(
        "set q background 'linear-gradient(#2563eb, #7c3aed)' --on app-shell-header",
      );
    },
    T,
  );
  it(
    'y2k: bigger text never shrinks the body text',
    async test => {
      needsBases(test);
      const r = await answer('make all text bigger', 'y');
      expect(r.first).not.toContain('set y text-size more');
    },
    T,
  );
  it(
    'y2k: rounder corners keep the pill badges a pill',
    async test => {
      needsBases(test);
      await themeEditSet('y', 'corners', 'more', {cwd});
      const css = fs.readFileSync(path.join(cwd, 'themes/y/y.css'), 'utf8');
      const badge = /\.astryx-badge \{[^}]*\}/.exec(css)?.[0] ?? '';
      expect(badge).not.toMatch(/border-radius: var\(--radius-full\)/);
    },
    T,
  );
  it(
    'butter: more colorful never changes the dark accent hue',
    async test => {
      needsBases(test);
      const r = await answer('make it more colorful', 'b');
      expect(r.first.some(c => / accent /.test(c))).toBe(false);
    },
    T,
  );
  it.each([
    'remove the card border and shadow',
    "remove the card's border and shadow",
    'remove the card’s border and shadow',
  ])(
    '%s removes both',
    async ask => {
      expect((await answer(ask)).first).toEqual([
        'set q border none --on card',
        'set q box-shadow none --on card',
      ]);
    },
    T,
  );
  it(
    'except when hovered pins the hover fill under the tint',
    async () => {
      const {first} = await answer('make buttons darker except when hovered');
      const hover = first.filter(c => /--state hover/.test(c));
      expect(hover.length).toBeGreaterThan(0);
      expect(hover.every(c => /^set q background-color /.test(c))).toBe(true);
      expect(hover.some(c => /overlay/.test(c))).toBe(false);
    },
    T,
  );
});

describe('asks it used to drop', () => {
  it(
    'butter: an except of a variant is measured on the rules butter writes',
    async test => {
      needsBases(test);
      const {first} = await answer(
        'make buttons rounder except primary buttons',
        'b',
      );
      expect(first.length).toBeGreaterThan(0);
    },
    T,
  );
  it(
    'a "no bigger than" bound is a target',
    async () => {
      expect(
        (await answer('make card corners no bigger than 4px')).first,
      ).toEqual(['set q border-radius 4px --on card']);
    },
    T,
  );
  it(
    'butter: an except of cards with a part dial measures the part tokens',
    async test => {
      needsBases(test);
      const {first} = await answer('more padding everywhere except cards', 'b');
      expect(first.length).toBeGreaterThan(0);
    },
    T,
  );
  it(
    'butter: lighter text in dark mode is lighter, on both sides',
    async test => {
      needsBases(test);
      const {first} = await answer('make the text lighter in dark mode', 'b');
      expect(first).toHaveLength(1);
      expect(first[0]).toMatch(
        /--color-text-primary '#[0-9a-f]{6}' --mode dark$/,
      );
    },
    T,
  );
  it(
    'a shadow typed for one mode goes into light-dark()',
    async () => {
      expect(
        (await answer('card shadow 0 4px 12px #00000080 in dark mode')).first,
      ).toEqual([
        "set q box-shadow '0 4px 12px light-dark(transparent, #00000080)' --on card",
      ]);
    },
    T,
  );
  it(
    'a shadow on a part that shows none it can read is a change',
    async () => {
      expect((await answer('popover shadow bigger')).first).toEqual([
        "set q box-shadow 'var(--shadow-high)' --on popover",
      ]);
    },
    T,
  );
  it(
    'a length typed with no way is never a spacing step',
    async () => {
      for (const q of ['spacing 18px', 'token --space-4 to 18px'])
        // (A refusal writes nothing either.)
        expect((await answer(q).catch(() => ({first: []}))).first).toEqual([]);
    },
    T,
  );
  it(
    'a color clause after an outline ask is that outline color',
    async () => {
      expect(
        (await answer('focus outline on text inputs only, pink #DB2777'))
          .first[0],
      ).toBe(
        "set q border-color '#db2777' --on text-input --state focus-within --only",
      );
    },
    T,
  );
});
