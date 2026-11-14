// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how` reads what the question means before it answers: a
 * part the question only compares against is never changed; a prohibition
 * changes nothing; a question about a value answers with the value; and
 * the excepted, compared, nested, elided and per-variant forms each keep
 * the scope the words give.
 *
 * @position api/theme-edit — tests
 */

import * as path from 'node:path';
import {spawnSync} from 'node:child_process';
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

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt78-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('q', {cwd, like: 'neutral'});
  await themeEditNew('r', {cwd, like: 'neutral'});
  await themeEditSet('r', 'border-radius', '6px', {cwd, on: 'card'});
  await themeEditSet('r', 'background-color', '#3366cc', {cwd, on: 'button'});
}, 240_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** Every command in every answer, and every text. @param {string} q @param {string} [theme] */
const answer = async (q, theme = 'q') => {
  const {data} = await themeEditHow(q, {cwd, theme});
  const results = data.results ?? [];
  return {
    commands: results
      .flatMap(r => r.commands)
      .filter(c => / editor (set|undo) /.test(c))
      .map(c => c.replace(/^.* editor /, '')),
    text: results.map(r => r.text).join('\n'),
  };
};

const T = 120_000;

describe('a part the question only compares against is never changed', () => {
  it.each([
    ['make cards rounder than buttons', 'button'],
    ['make badges smaller than buttons', 'button'],
    ['make the button background darker than the card background', 'card'],
    ['make the card darker than the page', null],
  ])(
    '%s',
    async (q, ref) => {
      const r = await answer(q);
      if (ref)
        expect(r.commands.some(c => c.includes(`--on ${ref}`))).toBe(false);
      else
        expect(
          r.commands.some(c => c.includes('--color-background-body')),
        ).toBe(false);
    },
    T,
  );
  it(
    '4px rounder than buttons is the button radius and 4px, on cards',
    async () => {
      const r = await answer('make cards 4px rounder than buttons');
      expect(r.commands[0]).toBe(
        "set q border-radius 'calc(var(--radius-element) + 4px)' --on card",
      );
    },
    T,
  );
  it(
    'a comparison keeps the state and variant',
    async () => {
      expect(
        (await answer('inputs as round as buttons on hover')).commands[0],
      ).toMatch(/--on inputs --state hover$/);
      expect(
        (await answer('make primary buttons as round as cards')).commands[0],
      ).toMatch(/--on button --when variant:primary$/);
    },
    T,
  );
  it(
    'nothing to measure against is said, never a step on both',
    async () => {
      const r = await answer('card padding the same as dialog padding');
      expect(r.commands).toEqual([]);
      expect(r.text).toContain('dialog has no padding of its own');
    },
    T,
  );
});

describe('a prohibition changes nothing', () => {
  it.each([
    "don't make the cards bigger",
    "don't make the text smaller",
    "don't make buttons rounder",
    'buttons should not be rounder than cards',
  ])(
    '%s',
    async q => {
      const r = await answer(q);
      expect(r.commands).toEqual([]);
      expect(r.text).toContain('stays as it is');
    },
    T,
  );
  it(
    'beside an ask, only the ask is answered',
    async () => {
      const r = await answer("make cards red but don't make buttons rounder");
      expect(r.commands.some(c => c.includes('--on button'))).toBe(false);
      expect(r.commands.some(c => c.includes('--on card'))).toBe(true);
    },
    T,
  );
});

describe('a question about a value answers with the value', () => {
  it.each([
    ['how much padding do buttons have', /button has padding \S+ now/],
    ['how rounded are cards', /card has border-radius \S+ now/],
    // A part with a fill: its fill, unless the words name its text.
    ['what color is the button', /button has background-color \S+ now/],
  ])(
    '%s',
    async (q, want) => {
      const r = await answer(q);
      expect(r.commands).toEqual([]);
      expect(r.text).toMatch(want);
    },
    T,
  );
});

describe('except keeps every excepted part, variant and state', () => {
  it(
    'an exact radius amount keeps cards',
    async () => {
      const r = await answer(
        'double the corner radius of everything except cards',
      );
      expect(
        r.commands.some(c => /^set q border-radius \S+ --on card$/.test(c)),
      ).toBe(true);
    },
    T,
  );
  it(
    'all text bigger keeps the button text size',
    async () => {
      const r = await answer('make all text bigger except buttons');
      expect(r.commands.some(c => /font-size \S+ --on button/.test(c))).toBe(
        true,
      );
    },
    T,
  );
  it(
    'a variant and a part together',
    async () => {
      const r = await answer(
        'make everything rounder except the primary button and cards',
      );
      expect(r.commands.some(c => c.includes('--when variant:primary'))).toBe(
        true,
      );
      expect(r.commands.some(c => c.includes('--on card'))).toBe(true);
    },
    T,
  );
  it(
    'a size, a muted variant and a state',
    async () => {
      expect(
        (
          await answer(
            'half the corner radius on all buttons except small ones',
          )
        ).commands,
      ).toEqual(
        expect.arrayContaining([expect.stringContaining('--when size:sm')]),
      );
      expect(
        (await answer('red background on cards except muted ones')).commands,
      ).toEqual(
        expect.arrayContaining([
          expect.stringContaining('--when variant:muted'),
        ]),
      );
      expect(
        (await answer('make all buttons blue except on hover')).commands,
      ).toEqual(
        expect.arrayContaining([expect.stringContaining('--state hover')]),
      );
    },
    T,
  );
  it(
    'shadows everywhere but cards keep the cards own shadow',
    async () => {
      const r = await answer('remove shadows from everything except cards');
      expect(r.commands.some(c => /box-shadow .+ --on card/.test(c))).toBe(
        true,
      );
    },
    T,
  );
});

describe('color comparisons copy the named property', () => {
  it(
    'button text takes the card text color',
    async () => {
      const r = await answer(
        'make the button text the same color as the card text',
      );
      expect(r.commands[0]).toMatch(/^set q color .+ --on button$/);
    },
    T,
  );
  it(
    'input border takes the button own fill',
    async () => {
      const r = await answer(
        'make the input border the same color as the button background',
        'r',
      );
      expect(r.commands[0]).toBe("set r border-color '#3366cc' --on inputs");
    },
    T,
  );
  it(
    'match the card background',
    async () => {
      const r = await answer(
        'make the dialog background match the card background',
      );
      expect(r.commands[0]).toMatch(/^set q background-color .+ --on dialog$/);
    },
    T,
  );
});

describe('two parts that should match', () => {
  it(
    'already matching: nothing changes',
    async () => {
      const r = await answer('make the card and dialog corners match');
      expect(r.commands).toEqual([]);
      expect(r.text).toContain('already have the same');
    },
    T,
  );
  it(
    'nothing to copy is said, never a new value for both',
    async () => {
      const r = await answer('buttons and inputs the same height');
      expect(r.commands).toEqual([]);
    },
    T,
  );
});

describe('scope words', () => {
  it(
    'a side border',
    async () => {
      expect((await answer('remove the top border on cards')).commands[0]).toBe(
        'set q border-top none --on card',
      );
    },
    T,
  );
  it(
    'close icons and header titles are their parts',
    async () => {
      expect((await answer('make the dialog close icon red')).commands[0]).toBe(
        "set q color '#dc2626' --on dialog-header-close-icon",
      );
      expect(
        (await answer('make the dialog header title bold')).commands[0],
      ).toBe('set q font-weight 700 --on dialog-header-title-block');
    },
    T,
  );
  it(
    'a part inside another applies everywhere, and the container is kept',
    async () => {
      const r = await answer('make buttons inside cards smaller');
      expect(r.commands.some(c => c.includes('--on card'))).toBe(false);
      expect(r.text).toContain('cannot keep card apart');
    },
    T,
  );
  it(
    'inputs with errors are the error status',
    async () => {
      expect(
        (await answer('red border on inputs with errors')).commands[0],
      ).toMatch(/--when status:error$/);
      expect(
        (await answer('make inputs with errors have a red background'))
          .commands[0],
      ).toMatch(/^set q background '#dc2626' --on inputs --when status:error$/);
    },
    T,
  );
  it(
    'a heading level named is that level only',
    async () => {
      expect((await answer('red h1')).commands[0]).toMatch(/--when level:1$/);
    },
    T,
  );
  it(
    'a part with its own radius steps from it',
    async () => {
      const r = await answer('make the cards rounder', 'r');
      expect(r.commands[0]).toBe('set r border-radius 7.5px --on card');
    },
    T,
  );
});

describe('two variants and elided clauses', () => {
  it(
    'white text on primary, black text on secondary',
    async () => {
      const r = await answer('white text on primary, black text on secondary');
      expect(r.commands).toEqual(
        expect.arrayContaining([
          "set q color '#ffffff' --on button --when variant:primary",
          "set q color '#000000' --on button --when variant:secondary",
        ]),
      );
    },
    T,
  );
  it(
    'a second clause takes the part and the kind of change',
    async () => {
      expect(
        (
          await answer(
            'make the button lighter on hover and darker when pressed',
          )
        ).commands,
      ).toEqual(
        expect.arrayContaining([expect.stringContaining('--state active')]),
      );
      expect(
        (
          await answer(
            'double the padding on primary buttons and half on ghost ones',
          )
        ).commands,
      ).toEqual(
        expect.arrayContaining([
          expect.stringContaining('--when variant:ghost'),
        ]),
      );
      expect(
        (await answer('make the badge text all caps and smaller')).commands,
      ).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/font-size .+ --on badge/),
        ]),
      );
    },
    T,
  );
});

describe('a theme name typed in another case keeps the question', () => {
  it(
    'suggests the same how with the right name',
    () => {
      const r = spawnSync(
        process.execPath,
        [
          path.resolve(import.meta.dirname, '../../clients/cli/bin/astryx.mjs'),
          'experimental',
          'theme',
          'editor',
          'how',
          'rounder cards',
          '--theme',
          'Q',
        ],
        {cwd, encoding: 'utf8'},
      );
      expect(r.stdout + r.stderr).toContain("how 'rounder cards' --theme q");
    },
    T,
  );
});

describe('"like" and "as" compare only in comparison forms', () => {
  it.each(
    /** @type {Array<[string, string[]]>} */ ([
      // Examples of the subject: every named part changes.
      // (Checks are left out by the measured check: corners more would
      // square the round radio.)
      ['make form controls like inputs and checkboxes rounder', ['inputs']],
      // A part named with "-er" is never a comparative before "like".
      [
        'make the container like dialogs and drawers rounder',
        ['dialog', 'drawer'],
      ],
      [
        'make controls like selects and switches bolder',
        ['selector', 'switch'],
      ],
      ['rounder components like dialogs and drawers', ['dialog', 'drawer']],
      ['components such as cards and dialogs rounder', ['card', 'dialog']],
    ]),
  )(
    '%s',
    async (q, parts) => {
      const {commands} = await answer(q);
      for (const p of parts)
        expect(commands.some(c => c.includes(`--on ${p}`))).toBe(true);
    },
    T,
  );

  it.each(
    /** @type {Array<[string, string]>} */ ([
      // A value for that part.
      [
        'use red as the button background',
        "set q background '#dc2626' --on button",
      ],
      [
        'use navy as the card background',
        "set q background '#1e3a8a' --on card",
      ],
      ['use 8px as the button radius', 'set q border-radius 8px --on button'],
      ['use 12px as the card padding', 'set q padding 12px --on card'],
    ]),
  )(
    '%s',
    async (q, want) => {
      expect((await answer(q)).commands[0]).toBe(want);
    },
    T,
  );

  it.each(
    /** @type {Array<[string, string, string]>} */ ([
      // Comparisons: the subject changes, the other part never.
      ['cards as round as buttons', 'card', 'button'],
      ['make cards as round as dialogs', 'card', 'dialog'],
      ['dialogs the same padding as cards', 'dialog', 'card'],
      ['make badges rounded like buttons', 'badge', 'button'],
      ['make cards round like the dialogs are', 'card', 'dialog'],
    ]),
  )(
    '%s',
    async (q, subject, other) => {
      const {commands} = await answer(q);
      expect(commands.some(c => c.includes(`--on ${subject}`))).toBe(true);
      expect(commands.some(c => c.includes(`--on ${other}`))).toBe(false);
    },
    T,
  );
});

describe('the answer that joins every clause is measured too', () => {
  it(
    'a joined answer left with one clause is not given again as "all of it"',
    async () => {
      const {data} = await themeEditHow(
        'make form controls like inputs and checkboxes rounder',
        {cwd, theme: 'q'},
      );
      expect(
        (data.results ?? []).some(r => /^all of it, in order/.test(r.text)),
      ).toBe(false);
    },
    T,
  );
  it(
    'components like dialogs and drawers rounder changes both',
    async () => {
      const {commands} = await answer(
        'make components like dialogs and drawers rounder',
      );
      expect(commands).toEqual(
        expect.arrayContaining([
          'set q corners more --on dialog',
          'set q corners more --on drawer',
        ]),
      );
    },
    T,
  );
  it(
    'never brings back a step the check left out',
    async () => {
      const {commands} = await answer(
        'make form controls like inputs and checkboxes rounder',
      );
      expect(commands.some(c => c.includes('--on checks'))).toBe(false);
      expect(commands[0]).toBe('set q corners more --on inputs');
    },
    T,
  );
});

describe('a lighter or darker accent moves that way in both modes', () => {
  /** @param {string} hex */
  const lum = hex => {
    const n = Number.parseInt(hex.slice(1, 7), 16);
    return (
      ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114
    );
  };
  it.each(['#2563eb', '#16a34a', '#db2777'])(
    'accent %s',
    async seed => {
      await themeEditSet('r', 'accent', seed, {cwd});
      const {context} = await import('./_context.mjs');
      const {howTheme} = await import('./_how-commands.mjs');
      const env = await howTheme(await context(cwd), cwd, 'r');
      const darkNow = String(env.own?.dark['--color-accent'] ?? '');
      expect(darkNow).toMatch(/^#[0-9a-f]{6}/);
      for (const way of ['lighter', 'darker']) {
        const {commands} = await answer(`make the accent ${way}`, 'r');
        const light = /^set r accent '(#[0-9a-f]{6})'/.exec(
          commands[0] ?? '',
        )?.[1];
        const dark = commands
          .map(
            c =>
              /^set r --color-accent '(#[0-9a-f]{6})' --mode dark$/.exec(
                c,
              )?.[1],
          )
          .find(Boolean);
        expect(light && dark).toBeTruthy();
        expect(lum(String(light)) > lum(seed)).toBe(way === 'lighter');
        expect(lum(String(dark)) > lum(darkNow)).toBe(way === 'lighter');
      }
    },
    240_000,
  );
});
