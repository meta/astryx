// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how` through one list grammar: lists of any part's
 * variants or states (before a noun, "ones" or after "when"), lists of
 * parts, the except said before the ask, a keep said first, and the readers
 * it leans on: a checkbox as its own part, a pill base's kept variant,
 * titles as text, a state on a part's items, outlines as borders, padded as
 * spacing, a mode phrase with "only" scoping the ask, and true reasons for
 * shadows how cannot measure.
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

// The assertions are about settings, builds, notes and lines, not rendered
// pages: a render costs seconds, so the pages are written by the stand-in.
vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

/** @type {string} */
let cwd;
/** Why a bundled base could not be installed here, when one could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt147-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral', 'chocolate']);
  if (unbuilt) return;
  await themeEditNew('n', {cwd, like: 'neutral'});
  await themeEditNew('ch', {cwd, like: 'chocolate'});
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
    results,
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

/** @param {string[]} cmds @param {string} flag */
const has = (cmds, flag) => cmds.some(c => c.includes(flag));

describe('one list grammar', () => {
  it(
    'a comma list of any part’s variants keeps each one, never a color',
    async test => {
      needsBases(test);
      const r = await answer(
        'make cards rounder except blue, teal and red cards',
      );
      for (const v of ['blue', 'teal', 'red'])
        expect(has(r.first, `--when variant:${v}`)).toBe(true);
      expect(r.first.join('\n')).not.toMatch(/background-color/);
    },
    T,
  );
  it(
    '"ones", an Oxford comma and "when" lists',
    async test => {
      needsBases(test);
      const ones = await answer(
        'make buttons rounder except primary, secondary, and ghost ones',
      );
      for (const v of ['primary', 'secondary', 'ghost'])
        expect(has(ones.first, `--when variant:${v}`)).toBe(true);
      const states = await answer(
        'make buttons rounder except disabled, hovered and focused ones',
      );
      for (const st of ['disabled', 'hover'])
        expect(has(states.first, `--state ${st}`)).toBe(true);
      const when = await answer('make buttons orange when hovered or pressed');
      expect(when.first).toEqual([
        "set n background-color '#f97316' --on button --state hover",
        "set n background-color '#f97316' --on button --state active",
      ]);
      const muted = await answer(
        'make cards rounder except muted and blue cards',
      );
      expect(has(muted.first, '--when variant:muted')).toBe(true);
    },
    T,
  );
  it(
    'a list of parts gives each the ask',
    async test => {
      needsBases(test);
      expect(
        (await answer('make buttons, cards and inputs rounder')).first,
      ).toEqual([
        'set n corners more --on button',
        'set n corners more --on card',
        'set n corners more --on inputs',
      ]);
    },
    T,
  );
  it(
    'an except or a keep said before the ask',
    async test => {
      needsBases(test);
      for (const q of [
        'make everything except buttons rounder',
        'without changing buttons, make everything rounder',
      ]) {
        const r = await answer(q);
        expect(r.first[0]).toBe('set n corners more');
        expect(has(r.first, '--on button')).toBe(true);
        // (The change and the one keep for buttons: nothing else.)
        expect(r.first).toHaveLength(2);
      }
      // The change alone is not offered beside the except.
      const r = await answer('make cards rounder except muted and blue cards');
      expect(r.text).not.toMatch(/couldn't work out/);
    },
    T,
  );
});

describe('readers the lists lean on', () => {
  it(
    'checkboxes, a pill base’s kept variant, titles, items, outlines, padding',
    async test => {
      needsBases(test);
      expect((await answer('make checkboxes rounder')).first).toEqual([
        'set n corners more --on checkbox-indicator --only',
      ]);
      const pill = await answer(
        'make buttons less round except ghost ones',
        'ch',
      );
      expect(pill.first[0]).toBe('set ch corners less --on button');
      expect(has(pill.first, '--when variant:ghost')).toBe(true);
      // Core has no card title part: said, never every heading.
      const titles = await answer('make card titles red');
      expect(titles.first).toEqual([]);
      expect(titles.text).toMatch(/no card title part of its own/);
      expect(
        (await answer('side nav selected items should be #dbeafe')).first,
      ).toEqual([
        "set n background-color '#dbeafe' --on side-nav-item --state selected",
      ]);
      expect(
        (await answer('in dark mode, cards should be outlined in #ff0000'))
          .first[0],
      ).toBe("set n border-color '#ff0000' --on card --mode dark");
      expect((await answer('make badges less padded')).first).toEqual([
        'set n spacing less --on badge',
      ]);
      expect((await answer('make drop-down menus rounder')).first).toEqual([
        'set n corners more --on dropdown-menu',
      ]);
    },
    T,
  );
  it(
    'a mode phrase with "only" scopes the ask',
    async test => {
      needsBases(test);
      const r = await answer('make the accent darker in dark mode only');
      expect(r.first.join('\n')).not.toMatch(/ mode dark-only/);
      expect(r.first[0]).toMatch(/--mode dark$/);
      expect((await answer('dark mode only')).first).toEqual([
        'set n mode dark-only',
      ]);
    },
    T,
  );
  it(
    'shadows how cannot measure get a true reason',
    async test => {
      needsBases(test);
      // (The census sees a popover drawn open: its shadow is measured, and
      // softer starts from it, on the popover.)
      const pop = await answer('lighter shadows on popovers');
      expect(pop.first.join('\n')).not.toMatch(/'var\(--shadow-low\)'/);
      expect(pop.first.join('\n')).toMatch(/--on popover$/);
      const card = await answer('make card shadows softer in light mode');
      expect(card.first).toEqual([]);
      expect(card.text).toMatch(/draws no shadow of its own at rest/);
      expect(card.text).not.toMatch(/same in both modes/);
    },
    T,
  );
});
