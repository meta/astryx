// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how`: an element named in a place it cannot be kept to
 * ("the dialog's buttons") writes nothing and says why, unless the answer
 * holds there (a token set on the place, "the card's links"); the menu
 * separators are the menu's own divider; "the controls N tall" moves the
 * control heights every control reads.
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
  cwd = makeLinkedFixture('astryx-theme-how-places-', FIXTURE_PACKAGES);
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

describe('an element in a place', () => {
  it(
    "the menu's own divider, which Core draws on its own, is answered",
    async test => {
      needsBases(test);
      expect(
        (await answer('make the menu separators twice as thick')).all,
      ).toEqual(['--border-width 2px --on dropdown-menu-divider']);
    },
    T,
  );
  it(
    'a plain part in a place it cannot be kept to writes nothing, said',
    async test => {
      needsBases(test);
      const r = await answer("make the dialog's buttons rounder");
      expect(r.all).toEqual([]);
      expect(r.text).toMatch(/cannot be kept apart/);
    },
    T,
  );
  it(
    'an answer that holds in the place still answers',
    async test => {
      needsBases(test);
      expect((await answer("make the card's links red")).first).toEqual([
        "--color-text-accent '#dc2626' --on card",
      ]);
    },
    T,
  );
});

describe('the controls', () => {
  it(
    'move every control height together',
    async test => {
      needsBases(test);
      expect((await answer('make the controls 40px tall')).first).toEqual([
        '--size-element-lg 44px',
        '--size-element-md 40px',
        '--size-element-sm 36px',
      ]);
      expect((await answer('make all controls taller by 4px')).first).toEqual([
        '--size-element-lg 40px',
        '--size-element-md 36px',
        '--size-element-sm 32px',
      ]);
    },
    T,
  );
});
