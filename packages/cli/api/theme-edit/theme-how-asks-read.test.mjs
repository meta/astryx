// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how` reads: how transparent borders are (more or half as
 * transparent is their color, never their width), two colors of the
 * theme joined before one way, a ring said without focus (a ring at
 * rest), a toggle group's buttons and a date picker's days (the parts
 * they are), and an unknown word right before a part or after its
 * possessive (said, nothing written).
 *
 * @position api/theme-edit — tests
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-how-asks-read-', FIXTURE_PACKAGES);
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

describe('how asks are read', () => {
  it(
    'borders more or half as transparent change their color, never their width',
    async test => {
      needsBases(test);
      const more = await answer('make the borders more transparent');
      expect(more.text).toMatch(
        /border color of the whole theme: --color-border, fainter/,
      );
      expect(more.all.join('\n')).not.toMatch(/--border-width/);
      const half = await answer('make the borders half as transparent');
      expect(half.text).toMatch(/--color-border, stronger/);
      expect(half.all.join('\n')).not.toMatch(/--border-width/);
    },
    T,
  );

  it(
    'two colors of the theme joined before one way each take it',
    async test => {
      needsBases(test);
      const r = await answer('make the accent and danger darker');
      expect(r.text).toMatch(
        /accent: the editor makes its light and dark shades/,
      );
      expect(r.text).toMatch(
        /danger: the editor makes its light and dark shades/,
      );
      expect(r.all.some(x => /^accent /.test(x))).toBe(true);
      expect(r.all.some(x => /^danger /.test(x))).toBe(true);
    },
    T,
  );

  it(
    'a ring said without focus is a ring at rest; a focus ring stays the focus ring',
    async test => {
      needsBases(test);
      const card = (await answer('cards: 1px ring #e5e7eb')).first;
      expect(card).toHaveLength(1);
      expect(card[0]).toMatch(/^box-shadow '0 0 0 1px #e5e7eb, .+' --on card$/);
      expect(
        (await answer('focus-visible ring on buttons orange')).first.join(' '),
      ).toMatch(/--state focus-visible/);
    },
    T,
  );

  it(
    "a ring at rest goes in front of the part's own shadow, which stays",
    async test => {
      needsBases(test);
      // What Core draws: the card's own shadow layers, a popover's shadow
      // token.
      const card = (await answer('cards: 1px ring #e5e7eb')).first[0];
      expect(card).toMatch(/0 0 0 1px #e5e7eb, var\(--_card-ring/);
      expect(card).toMatch(/var\(--_card-elevation/);
      expect((await answer('popovers: 1px ring #e5e7eb')).first).toEqual([
        "box-shadow '0 0 0 1px #e5e7eb, var(--shadow-low)' --on popover",
      ]);
      // The line runs, and with the theme's own shadow on the part the
      // ring goes in front of that one.
      const value = /^box-shadow '(.+)' --on card$/.exec(card)?.[1] ?? '';
      await themeEditSet('n', 'box-shadow', value, {cwd, on: 'card'});
      await themeEditSet('n', 'box-shadow', 'var(--shadow-high)', {
        cwd,
        on: 'card',
      });
      expect((await answer('cards: 1px ring #e5e7eb')).first).toEqual([
        "box-shadow '0 0 0 1px #e5e7eb, var(--shadow-high)' --on card",
      ]);
    },
    T,
  );

  it(
    "a toggle group's buttons and a date picker's days name the parts they are",
    async test => {
      needsBases(test);
      const toggle = await answer("toggle group's buttons red");
      expect(toggle.text).toMatch(/toggle-button/);
      expect(toggle.text).not.toMatch(/\bswitch\b/);
      const days = await answer("date picker's days rounder");
      expect(days.text).toMatch(/calendar-day/);
    },
    T,
  );

  it(
    'an unknown word right before a part or after its possessive is said, and nothing is written',
    async test => {
      needsBases(test);
      for (const [q, word] of [
        ['the zorp card rounder', 'zorp'],
        ["the button's foo icon red", 'foo'],
      ]) {
        const r = await answer(q);
        expect(r.text).toMatch(new RegExp(`no part or word called "${word}"`));
        expect(r.all).toEqual([]);
      }
      // A size word before a part is no unknown word.
      expect((await answer('the big card rounder')).first).toEqual([
        'corners more --on card',
      ]);
    },
    T,
  );
});
