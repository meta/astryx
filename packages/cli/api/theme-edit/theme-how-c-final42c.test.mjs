// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how` guards (FINAL-42): a kept status look with no rule of
 * its own is judged by what it draws (an error input's inherited weight);
 * a kept variant that draws no line keeps it with nothing written back;
 * and an unknown word between a part and what changes is said, nothing
 * written.
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
  cwd = makeLinkedFixture('astryx-theme-how-c-final42c-', FIXTURE_PACKAGES);
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

describe('keeps judged by what draws', () => {
  it(
    'error inputs keep the weight they draw while the rest get bolder',
    async test => {
      needsBases(test);
      const r = await answer(
        'make the inputs bolder but keep the error inputs as they are',
      );
      expect(r.text).not.toMatch(/couldn't work out|cannot be kept apart/);
      expect(r.first[0]).toBe('font-weight 700 --on inputs');
      expect(r.first).toContain(
        'font-weight 400 --on inputs --when status:error',
      );
    },
    T,
  );
  it(
    'a kept variant that draws no border takes nothing written back',
    async test => {
      needsBases(test);
      const r = await answer(
        'remove the border from cards except the muted ones',
      );
      expect(r.text).not.toMatch(/couldn't work out/);
      expect(r.first).toEqual(['border none --on card']);
    },
    T,
  );
});

describe('an unknown word between a part and what changes', () => {
  it.each([
    ['make the card zorp border red', 'zorp'],
    ['make the button blorp padding bigger', 'blorp'],
  ])(
    '%s: said, nothing written',
    async (q, word, test) => {
      needsBases(test);
      const r = await answer(q);
      expect(r.text).toMatch(new RegExp(`no part or word called "${word}"`));
      expect(r.all).toEqual([]);
    },
    T,
  );
  it.each([
    'make the card top border red',
    'make the button text color red',
    'make the card hover background darker',
  ])(
    '%s: a known word there still answers',
    async (q, test) => {
      needsBases(test);
      expect((await answer(q)).first.length).toBeGreaterThan(0);
    },
    T,
  );
});
