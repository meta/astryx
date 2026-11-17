// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Text the sample page's pictures draw cut short (a label that ends in
 * an ellipsis because it no longer fits its part) is measured in the page by
 * the browser that takes the picture, and named in set's and show's results:
 * a note, and a problem with the line that keeps it whole when the browser
 * measured that line drawing it whole (following it does). A fresh theme's
 * pictures name nothing (butter's wider buttons wrap in the sample card
 * instead of being cut), and nothing is said without pictures.
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

const T = 300_000;
/**
 * The section each show here makes: the text measured is the sample page's,
 * which every show pictures, so the smallest sheet keeps each run to the
 * sample page, the open states and one short sheet, not every family.
 */
const SMALL = 'actions';
/** @type {string} */
let cwd;
/** Why butter could not be installed here, or ''. */
let unbuilt = '';
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-cut-short-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  unbuilt = await installRealBaseThemes(cwd, ['butter']);
}, T);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {Array<{problem: string, fix: string | null}>} list */
const cutProblems = list => list.filter(p => /cut short/.test(p.problem));
/** @param {any} r */
const cutNotes = r =>
  /** @type {string[]} */ (r.data.notes ?? []).filter(n => /cut short/.test(n));

describe('text the pictures draw cut short', () => {
  it(
    "a fresh theme's pictures name none",
    async () => {
      // The theme the next case makes too big, while it is fresh.
      await themeEditNew('big', {cwd, like: 'neutral'});
      const r = /** @type {any} */ (
        await themeEditShow('big', {cwd, png: true, section: SMALL})
      );
      expect(r.data.pictures).toContain('themes/big/preview.png');
      expect(cutNotes(r)).toEqual([]);
    },
    T,
  );

  it(
    "a fresh butter theme's wider buttons wrap in the sample card, whole, and name none",
    async () => {
      if (unbuilt) return;
      await themeEditNew('bt', {cwd, like: 'butter'});
      const r = /** @type {any} */ (
        await themeEditShow('bt', {cwd, png: true, section: SMALL})
      );
      expect(r.data.pictures).toContain('themes/bt/preview.png');
      expect(cutNotes(r)).toEqual([]);
    },
    T,
  );

  it(
    "a text size that cuts the sample card's badge labels is a problem with the line that keeps them whole, and following it draws them whole",
    async () => {
      // The fresh theme of the first case.
      const set = /** @type {any} */ (
        await themeEditSet('big', 'text-size', '28', {cwd, png: true})
      );
      expect(set.data.pictures).toContain('themes/big/preview.png');
      const notes = cutNotes(set);
      expect(notes).toContainEqual(
        expect.stringMatching(
          /^the sample page \(themes\/big\/preview\.png\) draws \d+ badge labels cut short \(.*"Draft".*\); the text no longer fits the badge$/,
        ),
      );
      // The buttons wrap instead: none is cut.
      expect(notes.join('\n')).not.toMatch(/button label/);
      expect(cutProblems(set.data.newProblems)).toEqual([
        {
          problem: expect.stringMatching(
            /^badge labels cut short in the sample page's pictures \(themes\/big\/preview\.png\): .*"Draft"/,
          ),
          fix: 'astryx experimental theme editor set big flex-shrink 0 --on badge',
        },
      ]);
      // Not a picture that failed: the pictures were taken.
      expect(set.data.pictureProblem ?? '').not.toMatch(/cut short/);
      const show = /** @type {any} */ (
        await themeEditShow('big', {cwd, png: true, section: SMALL})
      );
      expect(cutNotes(show)).toEqual(notes);
      expect(cutProblems(show.data.openProblems)).toEqual(
        cutProblems(set.data.newProblems),
      );
      // The line followed: the browser draws every label whole.
      const fixed = /** @type {any} */ (
        await themeEditSet('big', 'flex-shrink', '0', {
          cwd,
          on: 'badge',
          png: true,
        })
      );
      expect(fixed.data.pictures).toContain('themes/big/preview.png');
      expect(cutNotes(fixed)).toEqual([]);
      expect(cutProblems(fixed.data.newProblems)).toEqual([]);
      const after = /** @type {any} */ (
        await themeEditShow('big', {cwd, png: true, section: SMALL})
      );
      expect(cutProblems(after.data.openProblems)).toEqual([]);
    },
    T,
  );

  it(
    'where keeping the width does not draw the labels whole, no line is offered',
    async () => {
      await themeEditNew('huge', {cwd, like: 'neutral'});
      const set = /** @type {any} */ (
        await themeEditSet('huge', 'text-size', '32', {cwd, png: true})
      );
      const [problem, ...rest] = cutProblems(set.data.newProblems);
      expect(rest).toEqual([]);
      expect(problem.fix).toBe(null);
      expect(problem.problem).toMatch(
        /keeping the badge's width \(flex-shrink 0\) was measured and does not draw them whole there/,
      );
    },
    T,
  );

  it(
    'without pictures, nothing is measured and nothing is said',
    async () => {
      const r = /** @type {any} */ (
        await themeEditShow('big', {cwd, section: SMALL})
      );
      expect(r.data.pictures).toEqual([]);
      expect(cutNotes(r)).toEqual([]);
    },
    T,
  );
});
