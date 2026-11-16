// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how`: a thicker radio or checkbox
 * border keeps its resting color, never the hover tint; possessives name
 * the owner's own element, its state kept, the parts themselves before a
 * thing they have, and an element the owner lacks is said; a height in a
 * decimal unit is that height and a negative one is refused.
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
  cwd = makeLinkedFixture(
    'astryx-theme-how-thicker-radio-checkbox-border-',
    FIXTURE_PACKAGES,
  );
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
  const sets = (/** @type {string[]} */ cs) =>
    cs
      .filter(c => / editor set /.test(c))
      .map(c => c.replace(/^.* editor set \S+ /, ''));
  return {
    first: sets(
      results.find(r => r.commands.some(c => / editor set /.test(c)))
        ?.commands ?? [],
    ),
    all: sets(results.flatMap(r => r.commands)),
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

const T = 300_000;

describe('how thicker radio checkbox border', () => {
  it.each([
    'make the radio border thicker',
    'make the checkbox border thicker',
  ])(
    '%s: never the hover tint',
    async (q, test) => {
      needsBases(test);
      const r = await answer(q);
      for (const c of r.all) expect(c, q).not.toMatch(/--color-tint-hover/);
    },
    T,
  );
  it(
    'possessives',
    async test => {
      needsBases(test);
      expect((await answer("make the menu's hovered items red")).first).toEqual(
        ["background-color '#dc2626' --on dropdown-menu-item --state hover"],
      );
      // (A button set on every toggle button would reach those outside a
      // group too: nothing is written.)
      expect(
        (await answer("make the toggle group's buttons red")).first,
      ).toEqual([]);
      const both = await answer("make the cards' and buttons' borders red");
      expect(both.first.some(c => /--on card$/.test(c))).toBe(true);
      expect(both.first.some(c => /--on button$/.test(c))).toBe(true);
      const days = await answer("make the date picker's days rounder");
      expect(days.all).toEqual([]);
      expect(days.text).toMatch(/has no day part/);
    },
    T,
  );
  it(
    'heights in a decimal unit, and never negative',
    async test => {
      needsBases(test);
      expect((await answer('make the inputs 2.5rem high')).first).toEqual([
        '--size-element-md 40px --on inputs',
        '--size-element-sm 36px --on inputs',
      ]);
      const neg = await answer('make the buttons -4px tall');
      expect(neg.all).toEqual([]);
      expect(neg.text).toMatch(/cannot be -4px/);
    },
    T,
  );
});
