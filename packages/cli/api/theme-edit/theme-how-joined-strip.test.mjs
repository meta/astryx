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

  it('takes the corners, shadow and line color said after it', async test => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      test.skip();
    }
    const results = await answer(
      'pagination in one bordered strip with 3px corners, a soft shadow and #dddddd lines',
    );
    // Every clause is the strip's: none is left out or written elsewhere.
    expect(results).toHaveLength(1);
    const sets = results[0]?.sets ?? [];
    expect(sets[0]).toBe(
      "--color-border '#dddddd' --on pagination-list --mode light",
    );
    expect(sets).toContain(
      "box-shadow 'var(--shadow-low)' --on pagination-list",
    );
    expect(sets.filter(s => !/^--color-border |^box-shadow /.test(s))).toEqual(
      STRIP('3px', '2px'),
    );
    expect(results[0]?.text).toContain('"a soft shadow"');
    expect(results[0]?.text).toContain('"#dddddd lines"');
  }, 300_000);
});
