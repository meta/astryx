// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how`: a border color reaches every variant of a
 * selector, the status and focus colors kept; one size named moves only
 * the control height that size reads; a possessive owner's own element
 * ("the dropdown menu's items") is that element; a later "the shadows
 * softer" is the theme's shadows.
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
    'astryx-theme-how-border-color-reaches-variant-',
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

describe('how border color reaches variant', () => {
  it.each([
    ['make the selector border blue', 'selector'],
    ['make the input border red', 'inputs'],
  ])(
    '%s: no variant pinned back, status and focus kept',
    async (q, on, test) => {
      needsBases(test);
      const r = await answer(q);
      expect(r.first[0]).toMatch(
        new RegExp(`^border-color '#[0-9a-f]{6}' --on ${on}\\b`),
      );
      for (const c of r.first.slice(1).filter(x => /^border-color /.test(x)))
        expect(c).not.toMatch(/--when variant:/);
    },
    T,
  );
  it(
    'one size named moves only that control height',
    async test => {
      needsBases(test);
      expect((await answer('make the small buttons 4px taller')).first).toEqual(
        ['--size-element-sm 32px --on button'],
      );
    },
    T,
  );
  it(
    "a possessive owner's own element is that element",
    async test => {
      needsBases(test);
      expect(
        (await answer("make the dropdown menu's items red")).first,
      ).toEqual([
        "background-color '#dc2626' --on dropdown-menu-item --when variant:default",
      ]);
      const text = await answer("make the dropdown menu's item text bigger");
      expect(text.first[0]).toMatch(/--on dropdown-menu-item$/);
      for (const c of text.all) expect(c).not.toMatch(/--on dropdown-menu$/);
    },
    T,
  );
  it(
    'a later "the shadows softer" is the theme shadows',
    async test => {
      needsBases(test);
      const r = await answer('make the card green and the shadows softer');
      expect(r.first[0]).toBe(
        "background-color '#16a34a' --on card --when variant:default",
      );
      const shadows = r.first.filter(c => !/--on card/.test(c));
      expect(shadows.length).toBeGreaterThan(0);
      expect(shadows.every(c => /^--shadow-/.test(c))).toBe(true);
    },
    T,
  );
});
