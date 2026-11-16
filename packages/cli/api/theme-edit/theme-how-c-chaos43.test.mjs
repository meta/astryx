// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how` reads "twice as soft" as softer, a possessive owner
 * ("the menus' separators") as the place, never a second part to change,
 * and a divider's variant ("the strong divider") on its thickness line.
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
  cwd = makeLinkedFixture('astryx-theme-how-c-chaos43-', FIXTURE_PACKAGES);
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

describe('chaos43', () => {
  it(
    'twice as soft is softer: each shadow alpha halved, never doubled',
    async test => {
      needsBases(test);
      const r = await answer('make the shadow twice as soft');
      expect(r.text).toMatch(/alpha ×0\.5/);
      expect(r.text).not.toMatch(/×2\b/);
    },
    T,
  );
  it.each(["make the menus' separators red", "make the menu's separators red"])(
    '%s: the owner is the place, never painted',
    async (q, test) => {
      needsBases(test);
      const r = await answer(q);
      expect(r.first.length).toBeGreaterThan(0);
      for (const c of r.all) expect(c, q).not.toMatch(/--on dropdown-menu/);
      for (const c of r.all) expect(c, q).not.toMatch(/^background/);
    },
    T,
  );
  it.each([
    ['make the strong divider thicker', 'strong', '2px'],
    ['make subtle dividers thicker', 'subtle', '2px'],
    ['make the strong divider 3px', 'strong', '3px'],
  ])(
    '%s: the thickness on that variant only',
    async (q, v, px, test) => {
      needsBases(test);
      expect((await answer(q)).first).toEqual([
        `--border-width ${px} --on divider --when variant:${v}`,
      ]);
    },
    T,
  );
});
