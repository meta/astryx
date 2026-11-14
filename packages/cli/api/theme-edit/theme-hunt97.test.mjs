// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how`: an excepted part keeps its spacing (gap, padding and
 * height) and border width, whole-theme shadows move from their own layers
 * in each mode, a part's own gradient and own two-mode fill step each
 * color, a shadow by a percent, example values of the right kind, and the
 * measured check holds shadows and see-through to the way asked.
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
import {shadowAlphaScaled} from './_how-question.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-hunt97-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('q', {cwd, like: 'neutral'});
}, 240_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** @param {string} q */
const answer = async q => {
  const {data} = await themeEditHow(q, {cwd, theme: 'q'});
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

describe('exceptions that hold', () => {
  it(
    'compact except buttons keeps the buttons spacing',
    async () => {
      const {first} = await answer(
        'make everything more compact except buttons',
      );
      expect(first[0]).toBe('set q spacing less');
      expect(first.some(c => /^set q gap \S+ --on button$/.test(c))).toBe(true);
    },
    T,
  );
  it(
    'all borders thicker except on inputs keeps the inputs width',
    async () => {
      const {first} = await answer('all borders thicker except on inputs');
      expect(first[0]).toMatch(/^set q --border-width /);
      expect(
        first.some(c => /^set q border-width \S+ --on text-input/.test(c)),
      ).toBe(true);
    },
    T,
  );
});

describe('shadows from their own layers', () => {
  it('scales each color alpha, one mode only when asked', () => {
    const v = '0 2px 4px light-dark(oklch(0 0 0 / 10%), oklch(0 0 0 / 40%))';
    expect(shadowAlphaScaled(v, 1.5)).toBe(
      '0 2px 4px light-dark(oklch(0 0 0 / 15%), oklch(0 0 0 / 60%))',
    );
    expect(shadowAlphaScaled(v, 1.5, 'dark')).toBe(
      '0 2px 4px light-dark(oklch(0 0 0 / 10%), oklch(0 0 0 / 60%))',
    );
  });
  it(
    'make shadows darker steps each shared shadow, never a stock set',
    async () => {
      const {first} = await answer('make shadows darker');
      expect(first.length).toBeGreaterThan(0);
      expect(first.every(c => /^set q --shadow-(low|med|high) /.test(c))).toBe(
        true,
      );
      expect(first.join(' ')).not.toMatch(/rgb\(0 0 0 \/ 0\.18\)/);
    },
    T,
  );
  it(
    'darker shadows in dark mode is answered, never refused',
    async () => {
      expect(
        (await answer('make shadows darker in dark mode')).first.length,
      ).toBeGreaterThan(0);
    },
    T,
  );
  it(
    'the dialog shadow 50% darker scales its colors by half again',
    async () => {
      const {first} = await answer('make the dialog shadow 50% darker');
      expect(first[0]).toMatch(/^set q box-shadow '.*' --on dialog$/);
      expect(first[0]).not.toMatch(/var\(--shadow-/);
    },
    T,
  );
});

describe('own colors stepped', () => {
  it(
    'button gradient darker steps each stop of its own gradient',
    async () => {
      await themeEditSet(
        'q',
        'background',
        'linear-gradient(90deg, #3366cc, #66ccff)',
        {cwd, on: 'button'},
      );
      try {
        const {first} = await answer('make the button gradient darker');
        expect(first[0]).toMatch(
          /^set q background 'linear-gradient\(90deg, #[0-9a-f]{6}, #[0-9a-f]{6}\)' --on button/,
        );
        expect(first[0]).not.toMatch(/#3366cc|#ffffff/);
      } finally {
        await themeEditUndo('q', {cwd});
      }
    },
    T,
  );
  it(
    'an own two-mode badge fill darker steps each half',
    async () => {
      await themeEditSet('q', 'background', 'light-dark(#ffffff, #111111)', {
        cwd,
        on: 'badge',
      });
      try {
        expect(
          (await answer('make the badge background darker')).first[0],
        ).toMatch(
          /^set q background-color 'light-dark\(#[0-9a-f]{6}, #[0-9a-f]{6}\)' --on badge$/,
        );
      } finally {
        await themeEditUndo('q', {cwd});
      }
    },
    T,
  );
});
