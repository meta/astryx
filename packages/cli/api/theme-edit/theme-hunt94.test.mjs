// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how`: the measured check looks at every variant and state
 * a touched part shows, in each mode (or the one mode a one-mode theme
 * shows), reads the base theme's own rules, holds kept variants in every
 * state, and measures the answer that joins every clause; plus the asks it
 * used to drop or get wrong: headings smaller, pixel amounts, sizes written
 * "W by H", heading levels and ranges, the page as a compared part,
 * removals with the part at the end, the backdrop's see-through, shadows,
 * blur and a token pointing at another token.
 *
 * @position api/theme-edit — tests
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {
  themeEditHow,
  themeEditNew,
  themeEditSet,
  themeEditUndo,
} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt94-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('q', {cwd, like: 'neutral'});
  await themeEditNew('d', {cwd, like: 'neutral'});
  await themeEditSet('d', 'mode', 'dark-only', {cwd});
}, 240_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** Every set command and every text. @param {string} q @param {string} [theme] */
const answer = async (q, theme = 'q') => {
  const {data} = await themeEditHow(q, {cwd, theme});
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

describe('the measured check sees every variant, state and mode', () => {
  it(
    'button text darker: each variant from its own color, in each mode',
    async () => {
      const {first} = await answer('make the button text darker');
      expect(first.length).toBeGreaterThan(2);
      expect(
        first.every(c => / --when variant:[a-z]+ --mode (light|dark)$/.test(c)),
      ).toBe(true);
    },
    T,
  );
  it(
    'buttons lighter: each variant from its own fill, the danger one too',
    async () => {
      const {first} = await answer('make buttons lighter');
      expect(
        first.some(c => /--when variant:destructive --mode light$/.test(c)),
      ).toBe(true);
      expect(
        first.some(c => /--when variant:primary --mode light$/.test(c)),
      ).toBe(true);
    },
    T,
  );
  it(
    'a dark-only theme steps the accent from the dark value it shows',
    async () => {
      const {commands} = await answer('make the accent lighter', 'd');
      const hex = commands
        .map(c => /'(#[0-9a-f]{6})'/.exec(c)?.[1])
        .find(Boolean);
      expect(hex).toBeTruthy();
      expect(lum(String(hex))).toBeGreaterThan(200);
    },
    T,
  );
  it(
    'hover darker except primary keeps primary in that state',
    async () => {
      const {first} = await answer(
        'make the button hover darker except primary buttons',
      );
      expect(first).toContain(
        'set q filter none --on button --when variant:primary --state hover',
      );
    },
    T,
  );
  it(
    'all buttons blue except the danger one keeps its own fill',
    async () => {
      const {first} = await answer('all buttons blue except the danger one');
      expect(
        first.some(c =>
          /^set q background \S+ --on button --when variant:destructive$/.test(
            c,
          ),
        ),
      ).toBe(true);
    },
    T,
  );
});

describe('asks it used to drop', () => {
  it.each([
    'make headings smaller',
    'smaller headings',
    'make the headings less big',
  ])(
    '%s: never no answer',
    async q => {
      const {first} = await answer(q);
      expect(first[0]).toMatch(/^set q (type compact|--text-heading-1-size )/);
    },
    T,
  );
  it.each(
    /** @type {Array<[string, string]>} */ ([
      ['make the text 2px bigger', 'set q text-size 16'],
      ['make the card border 1px thicker', 'set q border-width 2px --on card'],
      ['borders 1px thicker', 'set q --border-width 2px'],
      ['make avatars 48px by 48px', 'set q width 48px --on avatar'],
    ]),
  )(
    '%s',
    async (q, want) => {
      expect((await answer(q)).first[0]).toBe(want);
    },
    T,
  );
  it(
    'thicker borders over a 3px border step up from 3px',
    async () => {
      await themeEditSet('q', '--border-width', '3px', {cwd});
      try {
        expect((await answer('thicker borders')).first[0]).toBe(
          'set q --border-width 4px',
        );
      } finally {
        await themeEditUndo('q', {cwd, thing: '--border-width'});
      }
    },
    T,
  );
  it(
    'a token pointing at another token reads as that value',
    async () => {
      await themeEditSet(
        'q',
        '--color-background-card',
        'var(--color-accent)',
        {
          cwd,
        },
      );
      try {
        const {first} = await answer('make the card background lighter');
        expect(
          first.some(c => /--when variant:default --mode light$/.test(c)),
        ).toBe(true);
      } finally {
        await themeEditUndo('q', {cwd, thing: '--color-background-card'});
      }
    },
    T,
  );
});

describe('heading levels', () => {
  it(
    'all headings red except h1 keeps h1 as it is',
    async () => {
      const {first} = await answer('make all headings red except h1');
      expect(first[0]).toBe("set q color '#dc2626' --on heading");
      expect(
        first.slice(1).every(c => / --on heading --when level:1$/.test(c)),
      ).toBe(true);
      expect(first.some(c => /^set q --color-text-primary /.test(c))).toBe(
        true,
      );
    },
    T,
  );
  it.each(
    /** @type {Array<[string, string[]]>} */ ([
      ['headings 1 through 3 bolder', ['1', '2', '3']],
      ['headings 2-4 red', ['2', '3', '4']],
    ]),
  )(
    '%s changes only those levels',
    async (q, levels) => {
      const {first} = await answer(q);
      expect(first.map(c => /level:(\d)/.exec(c)?.[1])).toEqual(levels);
    },
    T,
  );
  it(
    'heading level 9 is said, never a change',
    async () => {
      const r = await answer('heading level 9 bigger');
      expect(r.commands).toEqual([]);
      expect(r.text).toMatch(/no heading level 9/);
    },
    T,
  );
});

describe('parts named once for two removals, the page, steps', () => {
  it.each(
    /** @type {Array<[string, string[]]>} */ ([
      [
        'no border and no shadow on cards',
        ['set q border none --on card', 'set q box-shadow none --on card'],
      ],
      [
        'no shadow and no border on dialogs',
        ['set q box-shadow none --on dialog', 'set q border none --on dialog'],
      ],
    ]),
  )(
    '%s: both on that part, never the whole theme',
    async (q, want) => {
      const {first, commands} = await answer(q);
      expect(first).toEqual(want);
      expect(
        commands.some(c => /--(shadow|border)-[a-z-]+ (none|0px)$/.test(c)),
      ).toBe(false);
    },
    T,
  );
  it.each(
    /** @type {Array<[string, string[]]>} */ ([
      // A removal, then a positive ask: the ask keeps its own direction.
      [
        'no shadow and rounder corners on cards',
        ['set q box-shadow none --on card', 'set q corners more --on card'],
      ],
      // Every removal lead reads the same: "without", "remove the".
      [
        'without shadows and rounder corners on cards',
        ['set q box-shadow none --on card', 'set q corners more --on card'],
      ],
      [
        'remove the border and bigger padding on cards',
        ['set q border none --on card', 'set q spacing more --on card'],
      ],
      // The clause reader's negation reads the same leads.
      ['strip shadows from cards', ['set q box-shadow none --on card']],
      [
        'nix the shadow and rounder corners on cards',
        ['set q box-shadow none --on card', 'set q corners more --on card'],
      ],
      [
        'without the shadow and rounder corners on cards',
        ['set q box-shadow none --on card', 'set q corners more --on card'],
      ],
      // A lead governs a plain removable thing after "and".
      [
        'no shadows and borders on cards',
        ['set q box-shadow none --on card', 'set q border none --on card'],
      ],
      // A noun with an adjective is an ask of its own, never a removal.
      [
        'no shadow and rounded corners on cards',
        ['set q box-shadow none --on card', 'set q corners round --on card'],
      ],
      [
        'no border and bigger padding on cards',
        ['set q border none --on card', 'set q spacing more --on card'],
      ],
      [
        'no shadow and a red background on buttons',
        [
          'set q box-shadow none --on button',
          "set q background '#dc2626' --on button",
        ],
      ],
      [
        'no border and bolder text on badges',
        ['set q border none --on badge', 'set q font-weight 700 --on badge'],
      ],
      // Two removals, each with its own removal word.
      [
        'no border and zero padding on cards',
        ['set q border none --on card', 'set q padding 0px --on card'],
      ],
      [
        'remove the border and the shadow from cards',
        ['set q border none --on card', 'set q box-shadow none --on card'],
      ],
    ]),
  )(
    '%s',
    async (q, want) => {
      expect((await answer(q)).first).toEqual(want);
    },
    T,
  );
  it(
    'the dialog the same color as the page takes the page color',
    async () => {
      expect(
        (await answer('make the dialog the same color as the page')).first,
      ).toEqual([
        "set q background-color 'var(--color-background-body)' --on dialog",
      ]);
    },
    T,
  );
  it(
    '0 steps more changes nothing',
    async () => {
      expect((await answer('card padding 0 steps more')).commands).toEqual([]);
    },
    T,
  );
  it(
    'more padding everywhere except dialogs reads everywhere as everything',
    async () => {
      const r = await answer('more padding everywhere except dialogs');
      expect(r.text).not.toMatch(/no part is called "more"/);
    },
    T,
  );
  it(
    'rounder cards without shadows: rounder, and no shadow on cards',
    async () => {
      expect((await answer('rounder cards without shadows')).first).toEqual([
        'set q corners more --on card',
        'set q box-shadow none --on card',
      ]);
    },
    T,
  );
});

describe('see-through, shadows, blur and colors past another', () => {
  it(
    'the backdrop more transparent lowers its alpha in both modes',
    async () => {
      const {first} = await answer('make the backdrop more transparent');
      const alphas = first.map(c =>
        Number.parseInt(/'#[0-9a-f]{6}([0-9a-f]{2})'/.exec(c)?.[1] ?? 'ff', 16),
      );
      expect(alphas.length).toBe(2);
      expect(alphas[0]).toBeLessThan(0x80);
      expect(alphas[1]).toBeLessThan(0xcc);
    },
    T,
  );
  it(
    'the dialog shadow lighter is the next shared shadow down',
    async () => {
      expect((await answer('make the dialog shadow lighter')).first[0]).toBe(
        "set q box-shadow 'var(--shadow-med)' --on dialog",
      );
    },
    T,
  );
  it(
    'no blur keeps the shadow, blur at 0',
    async () => {
      const {first} = await answer('no blur on the dialog shadow');
      expect(first[0]).toMatch(/^set q box-shadow '\S+ \S+ 0px /);
    },
    T,
  );
  it(
    'remove the card background makes it see-through',
    async () => {
      expect((await answer('remove the card background')).first[0]).toBe(
        'set q background-color transparent --on card',
      );
    },
    T,
  );
  it(
    'slightly lighter than #000000 is a color past it',
    async () => {
      const {first} = await answer(
        'make the button background slightly lighter than #000000',
      );
      expect(first[0]).toMatch(/^set q background '#[0-9a-f]{6}' --on button/);
      expect(first[0]).not.toMatch(/#000000/);
    },
    T,
  );
});

describe('value questions', () => {
  it.each(
    /** @type {Array<[string, RegExp]>} */ ([
      ['what is the font of buttons', /button has font-family .+ now/],
      ['how much shadow do dialogs have', /dialog has box-shadow .+ now/],
      ['how thick is the card border', /card has border-width 1px now/],
    ]),
  )(
    '%s',
    async (q, want) => {
      const r = await answer(q);
      expect(r.commands).toEqual([]);
      expect(r.text).toMatch(want);
    },
    T,
  );
});

describe('a see-through overlay', () => {
  it(
    'more transparent lowers its alpha and more opaque raises it, rgba() included',
    async () => {
      await themeEditSet('q', '--color-overlay', 'rgba(0,0,0,0.5)', {cwd});
      try {
        /** @param {string} q */
        const alphas = async q =>
          (await answer(q)).first.map(c =>
            Number.parseInt(
              /'#[0-9a-f]{6}([0-9a-f]{2})'/.exec(c)?.[1] ?? 'zz',
              16,
            ),
          );
        const clearer = await alphas('make the backdrop more transparent');
        const denser = await alphas('make the backdrop more opaque');
        expect(clearer.length).toBeGreaterThan(0);
        expect(denser.length).toBeGreaterThan(0);
        expect(clearer.every(a => a < 0x80)).toBe(true);
        expect(denser.every(a => a > 0x80)).toBe(true);
      } finally {
        await themeEditUndo('q', {cwd, thing: '--color-overlay'});
      }
    },
    T,
  );
});

describe('mode words', () => {
  it('a typed word such as constructor is never a mode', async () => {
    const {MODE_WORDS} = await import('./_tables.mjs');
    expect(Object.getPrototypeOf(MODE_WORDS)).toBe(null);
    expect(MODE_WORDS.constructor).toBeUndefined();
  });
});
