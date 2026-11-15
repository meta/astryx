// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how` reads a negated word (un-, non-, -less) as its
 * opposite or its removal, refuses a shape measured against something with
 * no shape, says each removal of a long list, keeps an excepted size on
 * that size only (and says when a keep would take the change back),
 * answers both halves of a mode pair for any subject, leaves a kept heading
 * level's own token out, and colors a part's own title.
 *
 * @position api/theme-edit — tests
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditHow, themeEditNew} from './theme-edit.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-hunt170-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) return;
  await themeEditNew('n', {cwd, like: 'neutral'});
}, 600_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** @param {string} q */
const answer = async q => {
  const {data} = await themeEditHow(q, {cwd, theme: 'n'});
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

const T = 180_000;

describe('negated words', () => {
  it(
    'un-, non- and -less read as the opposite or the removal',
    async test => {
      needsBases(test);
      for (const q of [
        'make the buttons un-rounded',
        'make buttons unrounded',
        'make buttons non-rounded',
      ])
        expect((await answer(q)).first).toEqual([
          'set n corners square --on button',
        ]);
      expect((await answer('make the headings un-bold')).first[0]).toBe(
        'set n headings regular',
      );
      expect((await answer('make cards border-less')).first).toEqual([
        'set n border none --on card',
      ]);
      expect((await answer('make cards shadow-less')).first).toEqual([
        'set n box-shadow none --on card',
      ]);
    },
    T,
  );
  it(
    'a shape measured against something with no shape is refused',
    async test => {
      needsBases(test);
      const r = await answer('make buttons as round as the accent');
      expect(r.first).toEqual([]);
      expect(r.text).toMatch(/names no part with a border-radius/);
    },
    T,
  );
});

describe('lists, excepts and pairs', () => {
  it(
    'each removal of a long list',
    async test => {
      needsBases(test);
      expect(
        (
          await answer(
            'remove the border from cards, the shadow from dialogs, and the background from badges',
          )
        ).first,
      ).toEqual([
        'set n border none --on card',
        'set n box-shadow none --on dialog',
        'set n background-color transparent --on badge',
      ]);
    },
    T,
  );
  it(
    'an excepted size is kept on that size only',
    async test => {
      needsBases(test);
      expect(
        (await answer('make buttons bigger except the small ones')).first,
      ).toEqual([
        'set n spacing more --on button',
        'set n spacing medium --on button --when size:sm',
      ]);
    },
    T,
  );
  it(
    'both halves of a mode pair, for the main text too',
    async test => {
      needsBases(test);
      for (const q of [
        'make the text darker in dark mode and lighter in light mode',
        'make the text #333333 in light mode only, and #eeeeee in dark mode only',
      ]) {
        const r = await answer(q);
        expect(r.first.some(x => /--mode dark$/.test(x))).toBe(true);
        expect(r.first.some(x => /--mode light$/.test(x))).toBe(true);
      }
    },
    T,
  );
  it(
    'a kept heading level leaves its own token out',
    async test => {
      needsBases(test);
      const r = await answer('make every heading except h1 smaller');
      expect(r.first.length).toBe(5);
      expect(r.first.join('\n')).not.toMatch(/--text-heading-1-/);
      expect(r.text).toMatch(/keeps its own size/);
    },
    T,
  );
  it(
    'a part’s heading is its own title',
    async test => {
      needsBases(test);
      const r = await answer('make dialog heading text blue');
      expect(r.first[0]).toMatch(/--on dialog-header-title-block$/);
      expect(r.text).not.toMatch(/on heading:/);
    },
    T,
  );
});

describe('R03 and chaos38', () => {
  it(
    'a mode-split second half keeps the part phrase and its state',
    async test => {
      needsBases(test);
      expect(
        (
          await answer(
            'make selected tabs red in light mode and blue in dark mode',
          )
        ).first,
      ).toEqual([
        "set n background-color '#dc2626' --on tab --state selected --mode light",
        "set n background-color '#2563eb' --on tab --state selected --mode dark",
      ]);
    },
    T,
  );
  it(
    'a ghost state steps its own wash; a color word is no mode; a check mark is the mark',
    async test => {
      needsBases(test);
      const ghost = await answer(
        'make pressed or hovered ghost buttons darker in dark mode',
      );
      expect(ghost.first[0]).toMatch(
        /^set n --color-overlay-hover '#[0-9a-f]+' --on button --when variant:ghost --state hover --mode dark$/i,
      );
      expect(
        (await answer('make cards dark gray in light mode')).first[0],
      ).toMatch(/--mode light$/);
      expect(
        (await answer('make the checkbox check mark black')).first,
      ).toEqual(["set n color '#000000' --on checkbox-indicator-check"]);
    },
    T,
  );
  it(
    'an except holds in a one-mode answer',
    async test => {
      needsBases(test);
      const r = await answer(
        'make every input border blue in light mode but not selectors',
      );
      expect(r.first.at(-1)).toMatch(/--on selector --only$/);
      expect(r.text).not.toMatch(/nothing this change sets to keep/);
    },
    T,
  );
  it(
    'neither/nor, fully rounded, a keep said first, and the whole ask named',
    async test => {
      needsBases(test);
      expect(
        (await answer('make cards neither rounded nor bordered')).first,
      ).toEqual([
        'set n corners square --on card',
        'set n border none --on card',
      ]);
      expect((await answer('make buttons fully rounded')).first).toEqual([
        'set n corners pill --on button',
      ]);
      const kept = await answer('keeping cards, make everything rounder');
      expect(kept.first[0]).toBe('set n corners more');
      expect(kept.first.join('\n')).toMatch(/--on card/);
      expect(
        (
          await answer(
            'remove borders from cards and buttons but keep the inputs',
          )
        ).text,
      ).toMatch(
        /remove borders from cards, and remove borders from buttons, except/,
      );
    },
    T,
  );
});
