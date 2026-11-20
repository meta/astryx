// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how`: a text color asked with a fill given for one mode is
 * that mode's on every variant the fill reaches; a tint word tints only the
 * color it modifies, on every line that writes it.
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

describe('a tint word', () => {
  it(
    'every answer, the one that runs the whole ask too, tints the cards and never the header',
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
      for (const c of cards)
        expect(c).toMatch(/color-mix\(in srgb, #2563eb 15%, transparent\)/);
      // (A header line, where the answer writes one, is the navy, solid.)
      for (const c of fills.filter(c => /header\b/.test(c)))
        expect(c).toMatch(/'#1e3a8a' --on \S*header/);
    },
    T,
  );

  it(
    'a color already pale is the tint itself, written as said',
    async test => {
      needsBases(test);
      // ("a light blue tint", "a light gray wash": the color is the tint;
      // a 15% mix of a pale color would barely show.)
      for (const [ask, line] of [
        [
          'secondary button light blue tint with blue text',
          "background-color '#dbeafe' --on button --when variant:secondary",
        ],
        [
          'header with a light gray wash',
          "background-color '#e5e7eb' --on app-shell-header --mode light",
        ],
      ]) {
        const all = await sets(ask);
        expect(all, ask).toContain(line);
        expect(all.join('\n'), ask).not.toMatch(/color-mix/);
      }
      // (A strong or bright color said as a tint still mixes.)
      for (const ask of ['cards tinted blue', 'cards tinted aqua'])
        expect((await sets(ask)).join('\n'), ask).toMatch(
          /color-mix\(in srgb, #[0-9a-f]{6} 15%, transparent\)/,
        );
    },
    T,
  );

  it(
    'tints a part named before the clause the tint word is in',
    async test => {
      needsBases(test);
      const all = await sets(
        'Secondary button hover, in dark mode only: a slightly blue tint. Light mode untouched.',
      );
      const hover = all.filter(c =>
        /^background(?:-color)? .*--on button .*--state hover/.test(c),
      );
      expect(hover.length).toBeGreaterThan(0);
      for (const c of hover)
        expect(c).toMatch(/color-mix\(in srgb, #2563eb 15%/);
    },
    T,
  );

  it(
    'tints the color it modifies on every line, and leaves another color solid',
    async test => {
      needsBases(test);
      const all = await sets('cards tinted blue with a navy header');
      const fills = all.filter(c => /^background(?:-color)? /.test(c));
      const cards = fills.filter(c => / --on card\b/.test(c));
      expect(cards.length).toBeGreaterThan(0);
      for (const c of cards)
        expect(c).toMatch(/color-mix\(in srgb, #2563eb 15%, transparent\)/);
      // (The header the tint does not name is never tinted: where the
      // answer writes it, it is its own navy.)
      for (const c of fills.filter(c => /header\b/.test(c)))
        expect(c).toMatch(/'#1e3a8a' --on \S*header/);
      // (Said without the tint, a header line is the same navy.)
      for (const c of (await sets('cards blue with a navy header')).filter(c =>
        /^background(?:-color)? .*header\b/.test(c),
      ))
        expect(c).toMatch(/'#1e3a8a' --on \S*header/);
    },
    T,
  );

  it(
    'deepens a tint until the text asked with it reads in every mode',
    async test => {
      needsBases(test);
      const {data} = await themeEditHow('buttons tinted blue with white text', {
        cwd,
        theme: 'n',
      });
      // (The answer that runs the whole ask: white on a 15% blue tint over
      // the light page is 1.4:1.)
      const whole = (data.results ?? []).find(r => /^all of it/.test(r.text));
      expect(whole).toBeDefined();
      const all = (whole?.commands ?? [])
        .filter(c => / editor set /.test(c))
        .map(c => c.replace(/^.* editor set \S+ /, ''));
      expect(all.some(c => /#2563eb 15%/.test(c))).toBe(false);
      expect(whole?.text).not.toMatch(/at 15% over/);
      const fills = all.filter(c =>
        /^background(?:-color)? .*#2563eb.* --on button --when variant:/.test(
          c,
        ),
      );
      expect(fills.length).toBeGreaterThan(0);
      for (const fill of fills) {
        const when = /--when (\S+)/.exec(fill)?.[1];
        const text = all.filter(
          x =>
            x.startsWith("color '#ffffff' --on button") &&
            x.includes(`--when ${when}`),
        );
        expect(text.length).toBeGreaterThan(0);
        for (const c of text) expect(c).not.toMatch(/--mode/);
      }
      expect(whole?.text).toMatch(
        /the #2563eb tint is deepened to (?:\d+%|solid) so #ffffff text reads at \d+\.\d:1/,
      );
    },
    T,
  );

  it(
    'keeps a text color no strength of the tint reads on to the modes it reads in, and names a readable ink',
    async test => {
      needsBases(test);
      // (Yellow at any strength never takes white text to 4.5:1 on the
      // light page; over the dark page a light tint of it does.)
      const {data} = await themeEditHow(
        'buttons tinted #facc15 with white text',
        {cwd, theme: 'n'},
      );
      const whole = (data.results ?? []).find(r => /^all of it/.test(r.text));
      expect(whole).toBeDefined();
      const all = (whole?.commands ?? [])
        .filter(c => / editor set /.test(c))
        .map(c => c.replace(/^.* editor set \S+ /, ''));
      const text = all.filter(c => c.startsWith("color '#ffffff' --on button"));
      expect(text.length).toBeGreaterThan(0);
      for (const c of text) expect(c).toMatch(/--mode dark/);
      expect(whole?.text).toMatch(
        /#ffffff text on the \S+ button would not read on color-mix\(in srgb, #facc15 15%, transparent\) in light mode: \d\.\d\d:1, under the 4\.5:1 text needs, so it is kept to dark mode; #111827 reads there/,
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

  for (const [q, part, state] of [
    ['cards tinted blue with white text', 'card', ''],
    [
      'selected nav items tinted forest green with white text',
      'top-nav-item',
      '--state selected',
    ],
  ])
    it(
      `measures white text on ${q}`,
      async test => {
        needsBases(test);
        const {data} = await themeEditHow(q, {cwd, theme: 'n'});
        const whole = (data.results ?? []).find(r => /^all of it/.test(r.text));
        expect(whole).toBeDefined();
        const all = (whole?.commands ?? [])
          .filter(c => / editor set /.test(c))
          .map(c => c.replace(/^.* editor set \S+ /, ''));
        const fills = all.filter(c =>
          new RegExp(
            `^background(?:-color)? .* --on ${part}\\b${state ? `.*${state}` : ''}`,
          ).test(c),
        );
        expect(fills.length).toBeGreaterThan(0);
        // (White over a 15% tint on the light page is under 1.5:1: the
        // tint is deepened, or the text kept to the modes it reads in.)
        const text = all.filter(
          c => /'#ffffff'/.test(c) && new RegExp(`--on ${part}\\b`).test(c),
        );
        expect(text.length).toBeGreaterThan(0);
        // (Each text line sits on a fill this answer gives: the variants
        // that keep their own fill, the coloured cards, keep their text.)
        for (const c of text) {
          const when = /--when (\S+)/.exec(c)?.[1];
          expect(
            fills.some(f =>
              when ? f.includes(`--when ${when}`) : !/--when/.test(f),
            ),
          ).toBe(true);
        }
        const deepened = fills.every(c => !/ 15%, transparent/.test(c));
        if (!deepened) for (const c of text) expect(c).toMatch(/--mode dark/);
        expect(whole?.text).toMatch(
          /deepened to (?:\d+%|solid) so #ffffff text reads|#ffffff text on the .* would not read/,
        );
      },
      T,
    );
});
