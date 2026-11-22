// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how`: a text color asked with a fill given for one mode is
 * that mode's on every variant the fill reaches; a text color asked with a
 * see-through fill deepens it until the text reads, or is kept to the modes
 * it reads in; a color said for one part is that part's alone.
 *
 * @position api/theme-edit — tests
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew} from './theme-edit.mjs';
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
/** Why a bundled base could not be installed here, when one could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-how-tint-mode-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) return;
  await themeEditNew('n', {cwd, like: 'neutral'});
}, 600_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** Every set command an answer gives, after the theme name. @param {string} q */
const sets = async q => {
  const {data} = await themeEditHow(q, {cwd, theme: 'n'});
  return (data.results ?? [])
    .flatMap(r => r.commands)
    .filter(c => / editor set /.test(c))
    .map(c => c.replace(/^.* editor set \S+ /, ''));
};

/** @param {import('vitest').TestContext} test */
const needsBases = test => {
  if (unbuilt) {
    console.warn(`skipped: ${unbuilt}`);
    test.skip();
  }
};

const T = 300_000;

describe('a text color asked with a fill for one mode', () => {
  it(
    'is that mode only, on every variant the fill reaches',
    async test => {
      needsBases(test);
      const all = await sets(
        'buttons with a navy background in dark mode and white text',
      );
      // (On the variants the dark fill reaches, the white is dark mode's;
      // light mode keeps the secondary and ghost text that reads on their
      // light fills.)
      const white = all.filter(c =>
        /^color '#ffffff' .*variant:(?:secondary|ghost)/.test(c),
      );
      expect(white.length).toBeGreaterThan(0);
      for (const c of white) expect(c).toMatch(/ --mode dark$/);
    },
    T,
  );
});

describe('a color said for one part', () => {
  it(
    'tints the cards from the blue ramp and fills the header navy, on every answer',
    async test => {
      needsBases(test);
      const {data} = await themeEditHow(
        'cards tinted blue with a navy header',
        {
          cwd,
          theme: 'n',
        },
      );
      const fills = (data.results ?? [])
        .flatMap(r => r.commands)
        .filter(c => / editor set /.test(c))
        .map(c => c.replace(/^.* editor set \S+ /, ''))
        .filter(c => /^background(?:-color)? /.test(c));
      const cards = fills.filter(c => / --on card\b/.test(c));
      expect(cards.length).toBeGreaterThan(0);
      // (A light tint of the blue in each mode, from its palette ramp.)
      for (const c of cards)
        expect(c).toMatch(
          /'#bfd5ff' --on card .*--mode light$|'#0e3384' --on card .*--mode dark$/,
        );
      // (A header line, where the answer writes one, is the navy.)
      for (const c of fills.filter(c => /header\b/.test(c)))
        expect(c).toMatch(/'#1e3a8a' --on \S*header/);
    },
    T,
  );
});

describe('text asked with a see-through fill', () => {
  /** The answer that runs the whole ask, its set lines and its text. @param {string} q */
  const whole = async q => {
    const {data} = await themeEditHow(q, {cwd, theme: 'n'});
    const r = (data.results ?? []).find(x => /^all of it/.test(x.text));
    return {
      text: r?.text ?? '',
      all: (r?.commands ?? [])
        .filter((/** @type {string} */ c) => / editor set /.test(c))
        .map((/** @type {string} */ c) => c.replace(/^.* editor set \S+ /, '')),
    };
  };

  it(
    'deepens a see-through fill until the text asked with it reads in every mode',
    async test => {
      needsBases(test);
      // (White on a 15% blue over the light page is 1.4:1.)
      const {text, all} = await whole('buttons 15% blue with white text');
      expect(all.some(c => / 15%/.test(c))).toBe(false);
      expect(text).toMatch(
        /the blue tint is deepened to (?:\d+%|solid) so #ffffff text reads at \d+\.\d:1/,
      );
    },
    T,
  );

  it(
    'keeps a text color no strength of the fill reads on to the modes it reads in, and names a readable ink',
    async test => {
      needsBases(test);
      // (Yellow at any strength never takes white text to 4.5:1 on the
      // light page; over the dark page a light mix of it does.)
      const {text, all} = await whole('buttons 15% #facc15 with white text');
      const white = all.filter(c =>
        c.startsWith("color '#ffffff' --on button"),
      );
      expect(white.length).toBeGreaterThan(0);
      for (const c of white) expect(c).toMatch(/--mode dark/);
      expect(text).toMatch(
        /#ffffff text on the (?:\S+ )?button would not read on color-mix\(in srgb, #facc15 15%, transparent\) in light mode: \d\.\d\d:1, under the 4\.5:1 text needs, so it is kept to dark mode; #111827 reads there/,
      );
    },
    T,
  );

  it(
    'names an ink that reads at 4.5:1, never one just short of it',
    async test => {
      needsBases(test);
      // (#111827 reads at only 4.49:1 on #808080, white at 3.95:1: black,
      // at 5.32:1, is the ink that reads.)
      const {data} = await themeEditHow('buttons #808080 with white text', {
        cwd,
        theme: 'n',
      });
      const said = JSON.stringify(data.results ?? []);
      expect(said).toMatch(/#000000 reads there at 5\.31:1/);
      expect(said).not.toMatch(/#111827 reads there/);
    },
    T,
  );
});

describe('a tint word', () => {
  it(
    'keeps text asked with a tint to the modes it reads in, and says so',
    async test => {
      needsBases(test);
      const {data} = await themeEditHow(
        'selected nav items tinted forest green with white text',
        {cwd, theme: 'n'},
      );
      const all = (data.results ?? [])
        .flatMap(r => r.commands)
        .filter(c => / editor set /.test(c))
        .map(c => c.replace(/^.* editor set \S+ /, ''));
      expect(all).toContain(
        "background-color '#b7e2b3' --on top-nav-item --state selected --mode light",
      );
      expect(all).toContain(
        "background-color '#124811' --on top-nav-item --state selected --mode dark",
      );
      const white = all.filter(c => c.startsWith("color '#ffffff'"));
      expect(white.length).toBeGreaterThan(0);
      for (const c of white) expect(c).toMatch(/--mode dark$/);
      expect(JSON.stringify(data.results)).toMatch(
        /#ffffff text on the selected top-nav-item would not read on the tint in light mode: [\d.]+:1, under the 4\.5:1 text needs, so it is kept to dark mode; #111827 reads there/,
      );
    },
    T,
  );

  it(
    'keeps a gray tint gray, and keeps the part’s own text readable on a tint',
    async test => {
      needsBases(test);
      const lines = async (/** @type {string} */ q) =>
        ((await themeEditHow(q, {cwd, theme: 'n'})).data.results ?? [])
          .flatMap(r => r.commands ?? [])
          .filter(c => / editor set /.test(c))
          .map(c => c.replace(/^.* editor set \S+ /, ''));
      // (A gray seed grows as a neutral family: no hue comes in.)
      const gray = (await lines('cards tinted #9ca3af')).filter(c =>
        / --on card --when variant:default --mode /.test(c),
      );
      expect(gray.length).toBe(2);
      for (const c of gray) {
        const [r, g, b] = (/#([0-9a-f]{6})/.exec(c)?.[1] ?? '')
          .match(/../g)
          ?.map(x => parseInt(x, 16)) ?? [0, 0, 0];
        expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(24);
      }
      // (The primary button's own light label does not read on the pale
      // tint in light mode: a readable text line comes with it.)
      const primary = await lines('primary buttons tinted blue');
      expect(primary).toContain(
        "background-color '#bfd5ff' --on button --when variant:primary --mode light",
      );
      expect(primary).toContain(
        "color '#000000' --on button --when variant:primary --mode light",
      );
    },
    T,
  );

  it(
    'measures card text on each mode’s tint, and writes a color as pale as its tint as said',
    async test => {
      needsBases(test);
      const lines = async (/** @type {string} */ q) =>
        ((await themeEditHow(q, {cwd, theme: 'n'})).data.results ?? [])
          .flatMap(r => r.commands ?? [])
          .filter(c => / editor set /.test(c))
          .map(c => c.replace(/^.* editor set \S+ /, ''));
      const navy = (await lines('cards tinted blue with navy text')).filter(c =>
        /^--color-text-primary '#1e3a8a' --on card/.test(c),
      );
      expect(navy.length).toBeGreaterThan(0);
      for (const c of navy) expect(c).toMatch(/--mode light$/);
      const white = (await lines('cards tinted blue with white text')).filter(
        c => /^--color-text-primary '#ffffff' --on card/.test(c),
      );
      expect(white.length).toBeGreaterThan(0);
      for (const c of white) expect(c).toMatch(/--mode dark$/);
      // (A part another clause also fills is written as said: a tint on one
      // of its looks is not shown yet.)
      const two = await lines(
        'muted cards tinted blue, default cards navy with white text',
      );
      expect(two).toContain(
        "background-color '#1e3a8a' --on card --when variant:default",
      );
      expect(two.join('\n')).not.toMatch(/'#bfd5ff'/);
      // (One clause on every variant tints them all: none keeps the solid.)
      expect(
        (await lines('buttons tinted blue with white text')).join('\n'),
      ).not.toMatch(/'#2563eb'/);
      expect(await lines('cards with a cream tint')).toContain(
        "background-color '#fef3c7' --on card --when variant:default --mode light",
      );
    },
    T,
  );

  it(
    'says why text asked with a tint is not written when it reads in no mode, with no command',
    async test => {
      needsBases(test);
      const {data} = await themeEditHow('cards tinted blue with #808080 text', {
        cwd,
        theme: 'n',
      });
      // (The text clause's own answer.)
      const text = (data.results ?? []).find(r =>
        /^text color on card/.test(r.text),
      );
      expect(text?.text).toMatch(/so it is not written/);
      expect(text?.text).not.toMatch(/nothing to change/);
      expect(
        (text?.commands ?? []).filter(c => / editor set /.test(c)),
      ).toEqual([]);
    },
    T,
  );

  it(
    'writes a color said with its own shade word as said',
    async test => {
      needsBases(test);
      const {data} = await themeEditHow(
        'secondary button light blue tint with blue text',
        {cwd, theme: 'n'},
      );
      // (Every line the answers write, as before tints were read.)
      const first = [
        ...new Set(
          (data.results ?? [])
            .flatMap(r => r.commands ?? [])
            .filter(c => / editor set /.test(c))
            .map(c => c.replace(/^.* editor set \S+ /, '')),
        ),
      ].sort();
      expect(first).toEqual(
        [
          "color '#dbeafe' --on button --when variant:secondary",
          "background-color '#dbeafe' --on button --when variant:secondary",
          "color '#000000' --on button --when variant:secondary --mode dark",
        ].sort(),
      );
    },
    T,
  );

  it(
    'reads a tint said with a color as that color, never the hover wash',
    async test => {
      needsBases(test);
      /** @param {string} q */
      const lines = async q =>
        ((await themeEditHow(q, {cwd, theme: 'n'})).data.results ?? [])
          .flatMap(r => r.commands ?? [])
          .map(c => c.replace(/^.* editor set \S+ /, ''));
      const said = await lines('a light blue tint background');
      expect(said.join('\n')).not.toMatch(/--color-overlay-hover/);
      expect(said.some(c => /^--color-background-body '#/.test(c))).toBe(true);
      // (A color function typed before "tint background" is read whole.)
      for (const q of [
        'a rgb(37, 99, 235) tint background',
        'an hsl(220, 80%, 55%) tint background',
        'an oklch(0.6 0.15 250) tint background',
        'a color-mix(in srgb, blue 20%, white) tint background',
      ]) {
        const out = (await lines(q)).join('\n');
        expect(out, q).not.toMatch(/--color-overlay-hover/);
        expect(out, q).toMatch(/^--color-background-body '/m);
      }
      // (A tint with no color, or one asked less or more of a color, is
      // still the wash.)
      for (const q of [
        'the tint stronger',
        'the tint less blue',
        'the tint a little less red',
        'the tint is too blue',
      ])
        expect((await lines(q)).join('\n'), q).toMatch(/--color-overlay-hover/);
    },
    T,
  );
});
