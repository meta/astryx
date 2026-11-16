// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how` reads keeps through one keep grammar, density words
 * through one table and a fill's color after "with"; vibrancy counts a
 * color by whether its shades change.
 *
 * @position api/theme-edit — tests
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {DENSITY, densityWords} from './_tables.mjs';

// The assertions are about settings, builds, notes and lines, not rendered
// pages: a render costs seconds, so the pages are written by the stand-in.
vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-through-grammar-density-words-',
    FIXTURE_PACKAGES,
  );
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('q', {cwd, like: 'neutral'});
}, 240_000);

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

const T = 120_000;

describe('one keep grammar', () => {
  it.each([
    "make buttons rounder, but don't touch the inputs",
    'make buttons rounder, but leave inputs alone',
    'make buttons rounder but keep the inputs as they are',
  ])(
    '%s: the ask, the inputs outside it',
    async q => {
      const {first} = await answer(q);
      expect(first).toEqual(['set q corners more --on button']);
    },
    T,
  );
  it.each(['keep cards as they are', "don't touch the dialogs"])(
    'a line that is only a keep changes nothing: %s',
    async q => {
      const r = await answer(q);
      expect(r.first).toEqual([]);
      expect(r.text).toMatch(/nothing to change/);
    },
    T,
  );
});

describe('one density table', () => {
  it('names every density word once, in one kind', () => {
    const all = [...DENSITY.roomy, ...DENSITY.dense, ...DENSITY.crowded];
    expect(new Set(all).size).toBe(all.length);
    expect(densityWords('crowded').split('|')).toEqual([...DENSITY.crowded]);
  });
  it.each(
    /** @type {Array<[string, string]>} */ ([
      ['cards feel cramped', 'set q spacing more --on card'],
      ['cards are too airy', 'set q spacing less --on card'],
      ['make cards denser', 'set q spacing less --on card'],
    ]),
  )(
    '%s',
    async (q, want) => {
      expect((await answer(q)).first).toEqual([want]);
    },
    T,
  );
});

describe('a fill’s color after "with"', () => {
  it(
    'selected rows tinted with the accent: the selected state’s wash',
    async () => {
      for (const q of [
        'selected table rows tinted with the accent at low strength',
        'tint selected table rows with accent color, nothing else',
      ])
        expect((await answer(q)).first).toEqual([
          "set q --color-accent-muted 'color-mix(in srgb, var(--color-accent) 15%, transparent)' --on table-row --state selected",
        ]);
    },
    T,
  );
});

describe('vibrancy counts what it changes', () => {
  it(
    'a warm gray takes vibrancy less; a pure gray is refused with the reason',
    async () => {
      await themeEditNew('w', {cwd, like: 'neutral'});
      await themeEditSet('w', 'neutral', '#78716c', {cwd});
      await expect(
        themeEditSet('w', 'vibrancy', 'less', {cwd}),
      ).resolves.toBeTruthy();
      await themeEditNew('g', {cwd, like: 'neutral'});
      await themeEditSet('g', 'neutral', '#808080', {cwd});
      await expect(
        themeEditSet('g', 'vibrancy', 'less', {cwd}),
      ).rejects.toThrow(
        /neutral #808080\) comes out the same at every vibrancy/,
      );
    },
    T,
  );
});
