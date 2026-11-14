// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how` measures its answer: every suggested command is built
 * in memory with the theme (the compile `set` builds from; nothing is
 * written), and the values the touched parts show, in light and dark, must
 * change the way the question asks; parts it keeps must show the same
 * values. A command that does not is left out with a plain line. Also the
 * words that name an exception, a comparison, a prohibition and a value
 * question.
 *
 * @position api/theme-edit — tests
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditHow, themeEditNew} from './theme-edit.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-hunt87-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('q', {cwd, like: 'neutral'});
}, 240_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** Every set command and every text. @param {string} q */
const answer = async q => {
  const {data} = await themeEditHow(q, {cwd, theme: 'q'});
  const results = data.results ?? [];
  return {
    commands: results
      .flatMap(r => r.commands)
      .filter(c => / editor set /.test(c))
      .map(c => c.replace(/^.* editor /, '')),
    text: results.map(r => r.text).join('\n'),
  };
};

const T = 120_000;

describe('the measured check: answers that fooled the step check', () => {
  it.each(
    /** @type {Array<[string, (c: string[]) => boolean]>} */ ([
      // A wrong-way or wrong-kind command never comes out.
      [
        'make the focus ring lighter',
        c => c.every(x => !/--focus-outline-width/.test(x)),
      ],
      [
        'make the focus ring darker',
        c => c.every(x => !/--focus-outline-width/.test(x)),
      ],
      [
        'card border less thick',
        c => c.every(x => !/border-width 2px/.test(x)),
      ],
      ['card corners less sharp', c => c.every(x => !/corners square/.test(x))],
      [
        'make the card padding smaller than 24px',
        c => c.every(x => !/padding 24px/.test(x)),
      ],
    ]),
  )(
    '%s',
    async (q, ok) => {
      expect(ok((await answer(q)).commands)).toBe(true);
    },
    T,
  );

  it(
    'lighter accent: the dark half moves lighter too',
    async () => {
      const r = await answer('make the accent lighter');
      expect(r.commands).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/--color-accent .+ --mode dark$/),
        ]),
      );
    },
    T,
  );

  it(
    'a kept group keeps every member as it shows now',
    async () => {
      const r = await answer('make everything rounder; never round the inputs');
      expect(r.commands.some(c => /--on inputs/.test(c))).toBe(true);
    },
    T,
  );
});

describe('words for except', () => {
  it.each([
    'make everything rounder besides cards',
    'make everything rounder save for cards',
    'make everything rounder but keep cards as they are',
    'make everything rounder, cards excepted',
  ])(
    '%s keeps cards',
    async q => {
      expect(
        (await answer(q)).commands.some(c =>
          /^set q border-radius \S+ --on card$/.test(c),
        ),
      ).toBe(true);
    },
    T,
  );
  it(
    'without changing buttons keeps buttons',
    async () => {
      const r = await answer('make the cards rounder without changing buttons');
      expect(r.commands.some(c => /--on button/.test(c))).toBe(false);
      expect(r.commands.some(c => /--on card/.test(c))).toBe(true);
    },
    T,
  );
});

describe('words for and, comparisons and prohibitions', () => {
  it(
    'as well as is and',
    async () => {
      const r = await answer('make buttons as well as cards rounder');
      expect(r.commands.some(c => /--on button/.test(c))).toBe(true);
      expect(r.commands.some(c => /--on card/.test(c))).toBe(true);
    },
    T,
  );
  it(
    'compared to is a comparison',
    async () => {
      const r = await answer('make cards rounder compared to buttons');
      expect(r.commands.some(c => /--on button/.test(c))).toBe(false);
    },
    T,
  );
  it(
    "don't let the text get smaller changes nothing",
    async () => {
      expect((await answer("don't let the text get smaller")).commands).toEqual(
        [],
      );
    },
    T,
  );
  it(
    "shouldn't be so small asks for bigger",
    async () => {
      expect(
        (await answer("buttons shouldn't be so small")).commands[0],
      ).toMatch(/--on button$/);
    },
    T,
  );
  it(
    'remove the padding and border from cards is two removals',
    async () => {
      const r = await answer('remove the padding and border from cards');
      expect(r.commands).toEqual(
        expect.arrayContaining([
          'set q padding 0px --on card',
          'set q border none --on card',
        ]),
      );
    },
    T,
  );
  it(
    'black on secondary buttons is their text',
    async () => {
      expect((await answer('black on secondary buttons')).commands[0]).toBe(
        "set q color '#000000' --on button --when variant:secondary",
      );
    },
    T,
  );
});

describe('value questions', () => {
  it.each(
    /** @type {Array<[string, RegExp]>} */ ([
      ['how dark is the card background', /card has background-color \S+ now/],
      ['how much space do cards have', /card has padding \S+ now/],
      ['what is the padding of buttons', /button has padding \S+ now/],
      ["what's the font size of badges", /badge has font-size \S+ now/],
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
  it(
    'a question then an ask: both',
    async () => {
      const r = await answer('how rounded are cards? make them 12px');
      expect(r.commands).toContain('set q border-radius 12px --on card');
      expect(r.text).toMatch(/card has border-radius \S+ now/);
    },
    T,
  );
  it(
    'a setting pasted with a colon is its lookup',
    async () => {
      const {data} = await themeEditHow('corners:', {cwd, theme: 'q'});
      expect(data.kind).not.toBe('question');
    },
    T,
  );
});

describe('heading text', () => {
  it(
    'heading text lighter sets the text color on headings only',
    async () => {
      // Both forms build the same CSS: the heading's own text color.
      expect(
        (await answer('make the heading text lighter')).commands[0],
      ).toMatch(
        /^set q (--color-text-primary|color) '#[0-9a-f]{6}' --on heading/,
      );
    },
    T,
  );
});
