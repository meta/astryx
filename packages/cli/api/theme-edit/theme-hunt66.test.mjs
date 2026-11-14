// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file hunt66: two parts joined by "and" share the ask around them (its
 * amount, value and state), so each gets the whole ask; a context menu is
 * Core's context-menu part.
 *
 * @position api/theme-edit — tests
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt66-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
  await themeEditSet('t', 'border-radius', '10px', {cwd, on: 'button'});
  await themeEditSet('t', 'border-radius', '8px', {cwd, on: 'card'});
}, 240_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** Every change how gives first, without the CLI prefix. @param {string} q */
const changes = async q => {
  const {data} = await themeEditHow(q, {cwd, theme: 't'});
  const r = (data.results ?? []).find(x =>
    x.commands.some(c => / editor (set|undo) /.test(c)),
  );
  if (!r) return [];
  return (r.sequence ? r.commands : [r.commands[0]]).map(c =>
    c.replace(/^.* editor /, ''),
  );
};

describe('hunt66: parts joined by "and"', () => {
  it.each(
    /** @type {Array<[string, string[]]>} */ ([
      [
        'half the corner radius on buttons and cards on hover',
        [
          'set t border-radius 5px --on button --state hover',
          'set t border-radius 4px --on card --state hover',
        ],
      ],
      [
        'red background on buttons and cards on hover',
        [
          "set t background '#dc2626' --on button --state hover",
          "set t background '#dc2626' --on card --state hover",
        ],
      ],
      [
        'set the corner radius on buttons and cards to 4px on hover',
        [
          'set t border-radius 4px --on button --state hover',
          'set t border-radius 4px --on card --state hover',
        ],
      ],
      [
        'make buttons and cards rounder on hover',
        [
          'set t corners more --on button --state hover',
          'set t corners more --on card --state hover',
        ],
      ],
      // A decimal is not a sentence break.
      [
        'padding 0.5rem on buttons and cards',
        ['set t padding 0.5rem --on button', 'set t padding 0.5rem --on card'],
      ],
      [
        'border width 1.5px on buttons and cards',
        [
          'set t border-width 1.5px --on button',
          'set t border-width 1.5px --on card',
        ],
      ],
      [
        'half the corner radius on buttons and cards',
        [
          'set t border-radius 5px --on button',
          'set t border-radius 4px --on card',
        ],
      ],
    ]),
  )(
    '%s',
    async (q, want) => {
      expect(await changes(q)).toEqual(want);
    },
    120_000,
  );

  it('a context menu is the context-menu part', async () => {
    expect(await changes('context menus rounder')).toEqual([
      'set t corners more --on context-menu',
    ]);
  }, 120_000);
});
