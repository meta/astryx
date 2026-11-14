// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how` on the bundled neutral base: mode words are no
 * direction, mode phrases scope the ask, "weaker" shadows are softer, 8-digit
 * hex shadows scale and measure, a dial step beside a typed value still
 * goes the asked way, bounds ("at least", "under", "no bigger than"), kept
 * parts in every variant, levels and states, "leave X alone" / "don't touch
 * X", a token typed with a part, a color word before a part with color
 * variants, "bold white text", page gradients with colors, per-mode values,
 * badge colors, status notes, thinner borders and value questions that
 * name a mode.
 *
 * @position api/theme-edit — tests
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditHow, themeEditNew} from './theme-edit.mjs';
import {shadowAlphaScaled} from './_how-question.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

/** @type {string} */
let cwd;
/** Why the bundled neutral base could not be installed here, when it could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt99-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (!unbuilt) await themeEditNew('t', {cwd, like: 'neutral'});
}, 300_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** @param {string} q */
const answer = async q => {
  const {data} = await themeEditHow(q, {cwd, theme: 't'});
  const results = data.results ?? [];
  return {
    commands: results
      .flatMap(r => r.commands)
      .filter(c => / editor set /.test(c))
      .map(c => c.replace(/^.* editor /, '')),
    first: (
      results.find(r => r.commands.some(c => / editor set /.test(c)))
        ?.commands ?? []
    ).map(c => c.replace(/^.* editor /, '')),
    text: results.map(r => r.text).join('\n'),
  };
};

/** @param {string} hex */
const lum = hex => {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  return (
    ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114
  );
};

const T = 120_000;

/** @param {import('vitest').TestContext} test */
const needsBase = test => {
  if (unbuilt) {
    console.warn(`skipped: ${unbuilt}`);
    test.skip();
  }
};

describe('wrong writes that are no longer accepted', () => {
  it(
    'a bound in any wording holds the same way',
    async test => {
      needsBase(test);
      for (const q of [
        'make the card padding bigger than 4px',
        'card padding at least 4px',
        'card padding no smaller than 4px',
      ])
        expect((await answer(q)).first).toEqual([]);
    },
    T,
  );
  it(
    'darker … in light mode is darker',
    async test => {
      needsBase(test);
      const {first} = await answer('darker page background in light mode');
      const hex = /'(#[0-9a-f]{6})'/.exec(first[0] ?? '')?.[1];
      expect(hex).toBeTruthy();
      expect(lum(String(hex))).toBeLessThan(lum('#f1f1f1'));
      expect(first[0]).toMatch(/--mode light$/);
    },
    T,
  );
  it(
    'weaker and fainter shadows are softer; stronger in light mode is stronger',
    async test => {
      needsBase(test);
      expect((await answer('weaker shadows')).text).toMatch(/softer shadows/);
      expect((await answer('fainter shadows')).text).toMatch(/softer shadows/);
      expect((await answer('stronger shadows in light mode')).text).toMatch(
        /stronger shadows .* in light mode only/,
      );
    },
    T,
  );
  it('8-digit hex shadow colors scale by their alpha', () => {
    expect(shadowAlphaScaled('0 2px 4px #2d241b0D', 0.6)).toBe(
      '0 2px 4px #2d241b08',
    );
  });
  it(
    'a dial step beside a typed value never goes against the ask',
    async test => {
      needsBase(test);
      const {commands} = await answer('make card padding smaller, 16px');
      expect(commands.some(c => /spacing more/.test(c))).toBe(false);
    },
    T,
  );
  it.each(
    /** @type {Array<[string, RegExp | null]>} */ ([
      ['card radius at least 2px', null],
      ['card padding under 40px', null],
      ['button text no bigger than 12px', /^set t font-size 12px --on button$/],
    ]),
  )(
    'bound: %s',
    async (q, want, test) => {
      needsBase(/** @type {any} */ (test));
      const {first, text} = await answer(q);
      if (want) expect(first[0]).toMatch(want);
      else {
        expect(first).toEqual([]);
        expect(text).toMatch(/already .*; nothing to change/);
      }
    },
    T,
  );
  it(
    'all headings lighter except h2 and h3 keeps those levels',
    async test => {
      needsBase(test);
      const {first} = await answer(
        'make all headings lighter except h2 and h3',
      );
      expect(first.filter(c => /--when level:[23]$/.test(c))).toHaveLength(2);
    },
    T,
  );
  it(
    'except when disabled pins the disabled state',
    async test => {
      needsBase(test);
      const {first} = await answer(
        'darker primary buttons in dark mode except when disabled',
      );
      expect(first.some(c => /--state disabled --mode dark$/.test(c))).toBe(
        true,
      );
    },
    T,
  );
  it(
    'keep their hover the same pins the hover state',
    async test => {
      needsBase(test);
      const {first} = await answer(
        'make primary buttons darker but keep their hover the same',
      );
      expect(
        first.some(c => /--state hover( --mode (light|dark))?$/.test(c)),
      ).toBe(true);
    },
    T,
  );
  it(
    'an except on a part how cannot pin is said, never invented',
    async test => {
      needsBase(test);
      const r = await answer('make containers rounder except selectable cards');
      expect(r.commands.some(c => /selectable-card/.test(c))).toBe(false);
      expect(r.commands.some(c => /--on containers/.test(c))).toBe(false);
      expect(r.text).toMatch(/cannot be kept apart/);
    },
    T,
  );
  it(
    'mode phrases after a comma scope the ask',
    async test => {
      needsBase(test);
      for (const q of [
        'lighter card backgrounds, but not in light mode',
        'lighter card backgrounds, in dark mode',
      ]) {
        const {first} = await answer(q);
        expect(first.length).toBeGreaterThan(0);
        expect(first.every(c => /--mode dark$/.test(c))).toBe(true);
      }
    },
    T,
  );
  it(
    'a color word before a part with color variants is the color',
    async test => {
      needsBase(test);
      expect((await answer('blue card background')).first[0]).toBe(
        "set t background '#2563eb' --on card",
      );
    },
    T,
  );
  it(
    'a token typed with a part keeps the part',
    async test => {
      needsBase(test);
      expect((await answer('cards: --color-border #ff0000')).first).toEqual([
        "set t --color-border '#ff0000' --on card",
      ]);
      expect((await answer('--color-border #ff0000 on inputs')).first).toEqual([
        "set t --color-border '#ff0000' --on inputs",
      ]);
    },
    T,
  );
  it(
    'a status that paints with its own token gets no --when note or option',
    async test => {
      needsBase(test);
      const r = await answer('darker borders on inputs');
      expect(r.commands.some(c => /--when status:/.test(c))).toBe(false);
    },
    T,
  );
  it(
    'thinner input borders steps down from the width now and keeps its color',
    async test => {
      needsBase(test);
      const {first} = await answer('thinner input borders');
      expect(first[0]).not.toBe('set t border-width 1px --on inputs');
      const {commands} = await answer('thinner input borders');
      expect(commands.some(c => /var\(--color-border\)'/.test(c))).toBe(false);
    },
    T,
  );
});

describe('clear asks it used to drop', () => {
  it(
    'bold white text in the header gives the weight and the color',
    async test => {
      needsBase(test);
      const {commands} = await answer('bold white text in the header');
      expect(commands.some(c => /font-weight 700/.test(c))).toBe(true);
      expect(
        commands.some(c => /color(-text-primary)? '#ffffff'/.test(c)),
      ).toBe(true);
    },
    T,
  );
  it(
    'a page gradient keeps the colors it names, in order',
    async test => {
      needsBase(test);
      expect(
        (await answer('page background: gradient from #fff to #eef')).first[0],
      ).toBe("set t background 'linear-gradient(#fff, #eef)' --on app-shell");
      expect(
        (await answer('make the page background a blue gradient')).first[0],
      ).toMatch(
        /^set t background 'linear-gradient\(#2563eb, #[0-9a-f]{6}\)' --on app-shell$/,
      );
    },
    T,
  );
  it(
    'lighter text is answered',
    async test => {
      needsBase(test);
      expect((await answer('lighter text')).first.length).toBeGreaterThan(0);
    },
    T,
  );
  it(
    'badge lighter skips a base rule for a variant badge does not take',
    async test => {
      needsBase(test);
      const {first} = await answer('lighter badges');
      expect(first.length).toBeGreaterThan(0);
      expect(first.some(c => /variant:gray/.test(c))).toBe(false);
    },
    T,
  );
  it(
    'light mode X, dark mode Y gives both',
    async test => {
      needsBase(test);
      expect(
        (await answer('card background: light mode #eee, dark mode #222'))
          .first,
      ).toEqual([
        "set t background '#eee' --on card --mode light",
        "set t background '#222' --on card --mode dark",
      ]);
    },
    T,
  );
  it.each([
    'rounder buttons, but leave inputs alone',
    "make buttons rounder but don't touch inputs",
  ])(
    '%s: the buttons only',
    async (q, test) => {
      needsBase(/** @type {any} */ (test));
      const {commands} = await answer(q);
      expect(commands).toContain('set t corners more --on button');
      expect(commands.some(c => /--on inputs/.test(c))).toBe(false);
    },
    T,
  );
  it(
    'smaller headings but not h1 never moves h1',
    async test => {
      needsBase(test);
      const {commands} = await answer('smaller headings but not h1');
      expect(
        commands.some(c => /heading-1-size|^set t type |--on heading$/.test(c)),
      ).toBe(false);
    },
    T,
  );
  it.each(
    /** @type {Array<[string, RegExp]>} */ ([
      [
        'what color is the card border in dark mode?',
        /card has border-color \S+ in dark mode now/,
      ],
      [
        'what is the button background in dark mode?',
        /button has background-color \S+ in dark mode now/,
      ],
      [
        'what color are headings in dark mode',
        /heading has color #ffffff in dark mode now/,
      ],
    ]),
  )(
    '%s',
    async (q, want, test) => {
      needsBase(/** @type {any} */ (test));
      const r = await answer(q);
      expect(r.commands).toEqual([]);
      expect(r.text).toMatch(want);
    },
    T,
  );
});
