// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how` (FINAL-42): a possessive owner of several words is
 * the place and a part's own divider is Core's divider there, never the
 * owner painted; a height in px moves each control height token on the
 * part; a status border made thicker keeps the color it reads under that
 * status; a later clause whose subject is a role color or a dial takes no
 * part from the clause before.
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
  cwd = makeLinkedFixture('astryx-theme-how-c-final42-', FIXTURE_PACKAGES);
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

describe('FINAL-42', () => {
  it.each([
    [
      "make the dropdown menu's separators red",
      "--color-border '#dc2626' --on dropdown-menu-divider",
    ],
    [
      "make the menus' separators thicker",
      '--border-width 2px --on dropdown-menu-divider',
    ],
    [
      'make the menu separators thicker',
      '--border-width 2px --on dropdown-menu-divider',
    ],
  ])(
    "%s: the menu's own divider, never the menu painted nor every divider",
    async (q, line, test) => {
      needsBases(test);
      expect((await answer(q)).all, q).toEqual([line]);
    },
    T,
  );
  it(
    'a height in px moves each control height token, never one height',
    async test => {
      needsBases(test);
      expect((await answer('make the inputs 4px shorter')).first).toEqual([
        '--size-element-md 28px --on inputs',
      ]);
      expect((await answer('make the buttons 2px taller')).first).toEqual([
        '--size-element-md 34px --on button',
        '--size-element-sm 30px --on button',
      ]);
      // (A height value is a minimum; never one fixed height on a group
      // whose text area takes its height from its rows.)
      const tall = await answer('make the inputs 40px tall');
      expect(tall.first).toEqual(['min-height 40px --on inputs']);
      for (const c of tall.all) expect(c).not.toMatch(/^height /);
    },
    T,
  );
  it.each([
    ['make the invalid input border thicker', 'error'],
    ["make the warning inputs' border thicker", 'warning'],
  ])(
    '%s: the border keeps the color it reads under that status',
    async (q, status, test) => {
      needsBases(test);
      const r = await answer(q);
      for (const c of r.all.filter(x => /^border /.test(x)))
        expect(c, q).toMatch(new RegExp(`var\\(--color-border-${status}\\)`));
    },
    T,
  );
  it(
    'a later clause about the accent takes no part from the one before',
    async test => {
      needsBases(test);
      const r = await answer('make the card green and the accent darker');
      expect(r.first[0]).toBe("background-color '#16a34a' --on card");
      expect(r.first.slice(1).join('\n')).toMatch(/^accent /);
      expect(r.first.filter(c => /--on card/.test(c))).toHaveLength(1);
    },
    T,
  );
});
