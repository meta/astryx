// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how` reading through its shared readers on bundled bases:
 * pins from the base theme's own rule in each variant and state, a color
 * word before a part as the variant it names, one removal-list reader, one
 * mode spelling, bounds as limits, a button's radius as its corner token,
 * one-mode shadows that keep the other mode, fills with readable labels,
 * vibrancy measured on the accents shown, state excepts through one state
 * reader, and steps past the part compared against.
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
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

/** @type {string} */
let cwd;
/** Why a bundled base could not be installed here, when one could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt110-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral', 'butter', 'y2k']);
  if (unbuilt) return;
  await themeEditNew('n', {cwd, like: 'neutral'});
  await themeEditNew('y', {cwd, like: 'y2k'});
  await themeEditNew('b', {cwd, like: 'butter'});
  await themeEditNew('lo', {cwd, like: 'butter'});
  await themeEditSet('lo', 'mode', 'light-only', {cwd});
}, 600_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** @param {string} q @param {string} [theme] */
const answer = async (q, theme = 'n') => {
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
    'a kept hover pins the base theme’s own variant fill, under Core’s tint',
    async test => {
      needsBases(test);
      const {first} = await answer('make buttons darker except when hovered');
      expect(first).toContain(
        "set n background-color 'var(--color-error-muted)' --on button --when variant:destructive --state hover --mode light",
      );
      expect(first.some(c => /^set n background '/.test(c))).toBe(false);
    },
    T,
  );
  it(
    'state excepts read through one state reader',
    async test => {
      needsBases(test);
      for (const q of [
        'make buttons darker except disabled',
        'make buttons darker, keep disabled ones as they are',
      ])
        expect(
          (await answer(q)).first.some(c => /--state disabled/.test(c)),
        ).toBe(true);
    },
    T,
  );
  it(
    'a focus except the inputs cannot keep leaves the plain answer out too',
    async test => {
      needsBases(test);
      expect(
        (await answer('make inputs darker except when focused')).first,
      ).toEqual([]);
    },
    T,
  );
  it(
    'buttons the color of the accent keep a readable label in every variant',
    async test => {
      needsBases(test);
      const {first} = await answer(
        'make buttons the same color as the accent',
        'b',
      );
      expect(first).toContain(
        "set b color 'var(--color-on-accent)' --on button --when variant:secondary",
      );
      expect(first).toContain(
        "set b background 'var(--color-accent)' --on button --when variant:secondary",
      );
    },
    T,
  );
  it(
    'a one-mode card shadow is refused: the card draws its ring in both modes',
    async test => {
      needsBases(test);
      expect(
        (await answer('card shadow 0 4px 12px #00000080 in dark mode', 'b'))
          .first,
      ).toEqual([]);
    },
    T,
  );
  it(
    'a color word before a part names its variant, or is refused',
    async test => {
      needsBases(test);
      expect((await answer('make blue cards rounder')).first).toEqual([
        'set n corners more --on card --when variant:blue',
      ]);
      expect((await answer('make red buttons darker')).first).toEqual([]);
      // The blue variant made darker, never painted the word's blue.
      const blue = (await answer('make the blue cards darker')).first;
      expect(blue.length).toBeGreaterThan(0);
      expect(blue.every(c => /--when variant:blue/.test(c))).toBe(true);
      expect(blue.some(c => /#2563eb/.test(c))).toBe(false);
    },
    T,
  );
  it(
    'a page reference is never written',
    async test => {
      needsBases(test);
      const {first} = await answer('make blue cards darker than the page');
      expect(first.some(c => /app-shell|--color-background-body/.test(c))).toBe(
        false,
      );
    },
    T,
  );
  it(
    'a button radius is its corner token, so button groups keep square joins',
    async test => {
      needsBases(test);
      await themeEditSet('b', 'border-radius', '4px', {cwd, on: 'button'});
      const css = fs.readFileSync(path.join(cwd, 'themes/b/b.css'), 'utf8');
      const rule = /\.astryx-button \{[^}]*\}/.exec(css)?.[0] ?? '';
      expect(rule).toMatch(/--radius-element: 4px/);
      expect(rule).not.toMatch(/border-radius: 4px/);
    },
    T,
  );
  it(
    'every removal form removes each thing it lists',
    async test => {
      needsBases(test);
      for (const q of [
        "take away the card's border and shadow",
        'remove the card border and shadow',
      ])
        expect((await answer(q)).first).toEqual([
          'set n border none --on card',
          'set n box-shadow none --on card',
        ]);
      expect(
        (await answer('remove the card border, shadow and background')).first,
      ).toEqual([
        'set n border none --on card',
        'set n box-shadow none --on card',
        'set n background-color transparent --on card',
      ]);
      expect(
        (await answer("remove the dialog's shadow and the card border")).first,
      ).toEqual([
        'set n box-shadow none --on dialog',
        'set n border none --on card',
      ]);
    },
    T,
  );
  it(
    '"dark-mode" is the dark mode a light-only theme does not have',
    async test => {
      needsBases(test);
      const r = await answer('in dark-mode, cards should be #1c1c1e', 'lo');
      expect(r.first).toEqual([]);
      expect(r.text).toMatch(/has only a light mode/);
    },
    T,
  );
  it.each(
    /** @type {Array<[string, string]>} */ ([
      ['make card corners at most 20px', 'n'],
      ['card padding at most 40px', 'b'],
      ['buttons no bigger than 60px tall', 'n'],
    ]),
  )(
    'an upper bound already met is no change: %s',
    async (q, theme, test) => {
      needsBases(/** @type {any} */ (test));
      const r = await answer(q, theme);
      expect(r.first).toEqual([]);
      expect(r.text).toMatch(/already/);
    },
    T,
  );
  it(
    'all text bigger except buttons is refused: phones keep their own size',
    async test => {
      needsBases(test);
      const r = await answer('make all text bigger except buttons');
      expect(r.first).toEqual([]);
      expect(r.text).toMatch(/differs by screen/);
    },
    T,
  );
});

describe('asks it used to drop', () => {
  it(
    'darker than the page goes past the page in each mode',
    async test => {
      needsBases(test);
      const {first} = await answer('make cards darker than the page', 'b');
      const dark = first.find(c =>
        /--on card --when variant:default --mode dark$/.test(c),
      );
      expect(
        lum(String(/'(#[0-9a-f]{6})/.exec(String(dark))?.[1])),
      ).toBeLessThan(lum('#261a13'));
      expect(
        (await answer('make the default card darker than the page')).first,
      ).toEqual(
        expect.arrayContaining([
          expect.stringMatching(
            /--on card --when variant:default --mode dark$/,
          ),
        ]),
      );
    },
    T,
  );
  it(
    'an except of a variant leaves that variant out',
    async test => {
      needsBases(test);
      const {first} = await answer(
        'make buttons darker except ghost buttons',
        'b',
      );
      expect(first.length).toBeGreaterThan(0);
      expect(first.some(c => /variant:ghost/.test(c))).toBe(false);
    },
    T,
  );
  it(
    'less colorful on a theme with a colored accent is answered',
    async test => {
      needsBases(test);
      const r = await answer('make it less colorful', 'b');
      expect(r.text).not.toMatch(/is a gray/);
    },
    T,
  );
  it(
    'darker text except links keeps the link’s color on the link',
    async test => {
      needsBases(test);
      const {first} = await answer('make text darker except links', 'b');
      expect(
        first.some(c => /--color-text-primary .* --on link$/.test(c)),
      ).toBe(true);
    },
    T,
  );
  it(
    'letter-spaced side nav section headings set the heading’s tracking',
    async test => {
      needsBases(test);
      const {first} = await answer(
        'uppercase letter-spaced side nav section headings',
      );
      expect(first).toEqual([
        expect.stringMatching(
          /^set n letter-spacing \S+ --on side-nav-heading$/,
        ),
      ]);
    },
    T,
  );
  it(
    'a refusal’s own command is offered only when it does what was asked',
    async test => {
      needsBases(test);
      // y2k's body text is at the dial's largest step: set names an exact
      // size, which is bigger.
      expect(
        (await answer('make all text bigger', 'y')).first.some(c =>
          /^set y text-size \d+$/.test(c),
        ),
      ).toBe(true);
      // A refusal naming the other way ("less") is never offered.
      await themeEditSet('n', 'text-size', 'larger', {cwd});
      expect(
        (await answer('make all text bigger')).first.some(c =>
          /text-size less/.test(c),
        ),
      ).toBe(false);
    },
    T,
  );
  it(
    '--at without a picture names a command that runs, never a made-up file',
    async test => {
      needsBases(test);
      const err = await themeEditHow('button', {
        cwd,
        theme: 'n',
        at: ['1,2'],
      }).catch(e => e);
      const names = (err?.suggestions ?? []).map(
        (/** @type {{name: string}} */ s) => s.name,
      );
      expect(names.join(' ')).not.toMatch(/picture\.png/);
      expect(
        names.some((/** @type {string} */ n) => /how button$/.test(n)),
      ).toBe(true);
    },
    T,
  );
});
