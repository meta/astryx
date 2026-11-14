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
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

/** @type {string} */
let cwd;
/** Why the bundled chocolate base could not be installed here, when it could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt97-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('q', {cwd, like: 'neutral'});
  unbuilt = await installRealBaseThemes(cwd, ['chocolate']);
  if (!unbuilt) await themeEditNew('c', {cwd, like: 'chocolate'});
}, 300_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** @param {string} q */
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

describe('shadows written as 8-digit hex colors', () => {
  it(
    'chocolate: darker shadows raise each color alpha, too strong lowers it',
    async test => {
      if (unbuilt) {
        console.warn(`skipped: ${unbuilt}`);
        return test.skip();
      }
      /** @param {string} q */
      const alphas = async q => {
        const {first} = await answer(q, 'c');
        expect(first.length).toBeGreaterThan(0);
        expect(first.every(c => /^set c --shadow-[a-z]+ '/.test(c))).toBe(true);
        return first.flatMap(c =>
          [...c.matchAll(/#[0-9a-f]{6}([0-9a-f]{2})\b/gi)].map(m =>
            Number.parseInt(m[1], 16),
          ),
        );
      };
      const darker = await alphas('make shadows darker');
      const softer = await alphas('the shadows are too strong');
      expect(darker.length).toBe(softer.length);
      expect(darker.every((a, i) => a > softer[i])).toBe(true);
    },
    T,
  );
  it(
    'chocolate: a mode-only ask scales that mode and leaves the other as it is',
    async test => {
      if (unbuilt) {
        console.warn(`skipped: ${unbuilt}`);
        return test.skip();
      }
      /** @param {string} q */
      const halves = async q => {
        const {first} = await answer(q, 'c');
        expect(first.length).toBeGreaterThan(0);
        return first.flatMap(c =>
          [
            ...c.matchAll(
              /light-dark\(#[0-9a-f]{6}([0-9a-f]{2}), #[0-9a-f]{6}([0-9a-f]{2})\)/gi,
            ),
          ].map(m => [Number.parseInt(m[1], 16), Number.parseInt(m[2], 16)]),
        );
      };
      const darkOnly = await halves('make shadows darker in dark mode');
      expect(darkOnly.length).toBeGreaterThan(0);
      expect(darkOnly.every(([light, dark]) => dark > light)).toBe(true);
      const lightOnly = await halves('make shadows lighter in light mode');
      expect(lightOnly.length).toBe(darkOnly.length);
      expect(lightOnly.every(([light, dark]) => light < dark)).toBe(true);
      // The mode not named keeps the alpha it has now in both answers.
      expect(darkOnly.map(([light]) => light)).toEqual(
        lightOnly.map(([, dark]) => dark),
      );
    },
    T,
  );
});

describe('a mode named for the shadows', () => {
  it(
    'chocolate: darker shadows in light mode raise the light halves only',
    async test => {
      if (unbuilt) {
        console.warn(`skipped: ${unbuilt}`);
        return test.skip();
      }
      for (const q of [
        'make shadows darker in light mode',
        'darker shadows in light mode',
        'make shadows stronger in light mode',
      ]) {
        const {first} = await answer(q, 'c');
        const pairs = first.flatMap(c =>
          [
            ...c.matchAll(
              /light-dark\(#[0-9a-f]{6}([0-9a-f]{2}), #[0-9a-f]{6}([0-9a-f]{2})\)/gi,
            ),
          ].map(m => [Number.parseInt(m[1], 16), Number.parseInt(m[2], 16)]),
        );
        expect(pairs.length).toBeGreaterThan(0);
        expect(pairs.every(([light, dark]) => light > dark)).toBe(true);
      }
    },
    T,
  );
  it(
    'a light-only theme asked about dark mode says it has no dark mode',
    async () => {
      await themeEditNew('lo', {cwd, like: 'neutral'});
      await themeEditSet('lo', 'mode', 'light-only', {cwd});
      const {first, text} = await answer(
        'make shadows darker in dark mode',
        'lo',
      );
      expect(first).toEqual([]);
      expect(text).toMatch(/has only a light mode/);
    },
    T,
  );
});
