// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how` reads "pagination pages in one bordered strip" as one
 * joined strip, from the parts themselves: the row draws the border and
 * corners with no gap, each control a separator after it, the end
 * controls (the ones Core marks `first` and `last`) the row's corners just
 * inside its border, and a cell of the row (the ellipsis) a separator too.
 * Looks said after the strip ("with 3px corners and a soft shadow, #dddddd
 * lines") are the strip's.
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
  cwd = makeLinkedFixture('astryx-theme-how-joined-strip-', FIXTURE_PACKAGES);
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
  return (data.results ?? []).map(r => ({
    text: r.text,
    sets: r.commands
      .filter(c => / editor set /.test(c))
      .map(c => c.replace(/^.* editor set \S+ /, '')),
  }));
};

const STRIP = (/** @type {string} */ outer, /** @type {string} */ inner) => [
  'gap 0 --on pagination-list',
  "border '1px solid var(--color-border)' --on pagination-list",
  `border-radius ${outer} --on pagination-list`,
  'border-radius 0 --on pagination-item',
  'border 0 --on pagination-item',
  "border-inline-end '1px solid var(--color-border)' --on pagination-item",
  `border-start-start-radius ${inner} --on pagination-item --state first`,
  `border-end-start-radius ${inner} --on pagination-item --state first`,
  `border-start-end-radius ${inner} --on pagination-item --state last`,
  `border-end-end-radius ${inner} --on pagination-item --state last`,
  'border-inline-end 0 --on pagination-item --state last',
  "border-inline-end '1px solid var(--color-border)' --on pagination-ellipsis",
];

describe('one joined strip', () => {
  it('is the row framed, its controls joined, its ends rounded', async test => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      test.skip();
    }
    const results = await answer('pagination pages in one bordered strip');
    expect(results).toHaveLength(1);
    expect(results[0]?.sets).toEqual(
      STRIP("'var(--radius-element)'", "'calc(var(--radius-element) - 1px)'"),
    );
  }, 300_000);

  it('takes the corners and line color said after it', async test => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      test.skip();
    }
    const results = await answer(
      'pagination in one bordered strip with 3px corners and #dddddd lines',
    );
    const strip = results.find(r => /as one strip/.test(r.text));
    const sets = strip?.sets ?? [];
    expect(sets[0]).toBe(
      "--color-border '#dddddd' --on pagination-list --mode light",
    );
    expect(sets.filter(s => !/^--color-border /.test(s))).toEqual(
      STRIP('3px', '2px'),
    );
    expect(strip?.text).toContain('"#dddddd lines"');
  }, 300_000);

  describe('the strip takes only its corners and line color', () => {
    /** Every set line of an ask, and its "all of it" answer. @param {string} q */
    const everything = async q => {
      const {data} = await themeEditHow(q, {cwd, theme: 'n'});
      const results = data.results ?? [];
      const lines = (/** @type {any} */ r) =>
        r.commands
          .flatMap((/** @type {string} */ c) => c.split(' && '))
          .filter((/** @type {string} */ c) => / editor set /.test(c))
          .map((/** @type {string} */ c) =>
            c.replace(/^.* editor set \S+ /, ''),
          );
      return {
        results: results.map(r => ({text: r.text, sets: lines(r)})),
        // (The whole answer: "all of it, in order", or its first sequence
        // and the ones after it.)
        whole: results
          .filter(
            (r, i) =>
              /^all of it, in order|^then, after the first/.test(r.text) ||
              (i === 0 &&
                results.some(x => /^then, after the first/.test(x.text))),
          )
          .flatMap(lines),
      };
    };

    it('keeps its shape in both modes when a mode is said, and scopes only the line color', async test => {
      if (unbuilt) {
        console.warn(`skipped: ${unbuilt}`);
        test.skip();
      }
      const [plain] = await answer(
        'dark mode: pagination pages in one bordered strip',
      );
      expect(plain.sets).toContain('gap 0 --on pagination-list');
      expect(plain.sets.join('\n')).not.toMatch(/--mode/);
      expect(plain.text).toMatch(
        /same in light and dark, so nothing of it is dark mode's own/,
      );
      const [lined] = await answer(
        'pagination pages in one bordered strip with #333333 lines in dark mode',
      );
      expect(lined.sets).toContain(
        "--color-border '#333333' --on pagination-list --mode dark",
      );
      expect(lined.text).toMatch(/its line color is for dark mode/);
    }, 240_000);

    it('leaves an ask with any other look said of the pager to the answer it had before', async test => {
      if (unbuilt) {
        console.warn(`skipped: ${unbuilt}`);
        test.skip();
      }
      for (const q of [
        'pagination pages in one bordered strip with a soft shadow',
        'pagination pages in one bordered strip, with a soft shadow',
        'pagination pages in one bordered strip plus a soft shadow',
        'pagination pages in one bordered strip with 3px corners, and with a large shadow',
        'pagination pages in one bordered strip with 2px lines',
        'pagination pages in one bordered strip with thick borders and 3px corners',
        'pagination pages in one bordered strip with square corners',
        'pagination in one bordered strip with 3px corners, a soft shadow and #dddddd lines',
      ]) {
        const {results} = await everything(q);
        expect(
          results.some(r => /^Pagination as one strip:/.test(r.text)),
          q,
        ).toBe(false);
        expect(results.flatMap(r => r.sets).join('\n'), q).not.toMatch(
          /border-inline-end/,
        );
      }
    }, 240_000);

    it('takes a line color only when said of its lines', async test => {
      if (unbuilt) {
        console.warn(`skipped: ${unbuilt}`);
        test.skip();
      }
      const {results} = await everything(
        'pagination pages in one bordered strip with a soft blue shadow',
      );
      expect(results.flatMap(r => r.sets).join('\n')).not.toMatch(
        /--color-border /,
      );
      const [joined] = await answer(
        'pagination pages in one bordered strip with 3px corners and #dddddd lines',
      );
      expect(joined.sets).toContain('border-radius 3px --on pagination-list');
      expect(joined.sets.join('\n')).toMatch(
        /--color-border '#dddddd' --on pagination-list/,
      );
    }, 240_000);
  });

  it('leaves a strip said with its own color or width to the answer it had before, on the row', async test => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      test.skip();
    }
    for (const q of [
      'pagination pages in one red bordered strip',
      'pagination pages in one 2px bordered strip',
    ]) {
      const sets = (await answer(q)).flatMap(r => r.sets).join('\n');
      expect(sets, q).not.toMatch(/--on pagination-item\b/);
    }
  }, 240_000);
});
