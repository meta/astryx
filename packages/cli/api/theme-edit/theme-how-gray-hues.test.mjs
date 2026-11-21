// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Words after a neutral-grays ask, read precisely. A hue or lightness
 * said of the grays (in a "with" phrase that names no part, or a comma or
 * "but" clause that is only a hue) keeps the clause's own reading. Another
 * part's color after them ("with blue accents", ", red for errors") leaves
 * the plain gray beside that color.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';
vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;
/** Why a bundled theme could not be installed here, when it could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-gray-hues-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (!unbuilt) {
    await themeEditNew('plain', {cwd, like: 'neutral'});
    await themeEditNew('warm', {cwd, like: 'neutral'});
    await themeEditSet('warm', 'neutral', '#78716c', {cwd});
  }
}, 600_000);

afterAll(() => removeLinkedFixture(cwd));

/** @param {import('vitest').TestContext} test */
const needsBases = test => {
  if (unbuilt) {
    console.warn(`skipped: ${unbuilt}`);
    test.skip();
  }
};

/**
 * Every result of an ask: its text and its set lines without the prefix.
 * @param {string} q @param {string} theme
 */
const answer = async (q, theme) => {
  const {data} = await themeEditHow(q, {cwd, theme});
  return /** @type {{text: string, commands: string[]}[]} */ (
    data.results ?? []
  ).map(r => ({
    text: r.text,
    lines: r.commands
      .flatMap(x => String(x).split(' && '))
      .filter(x => / editor set /.test(x))
      .map(x => x.replace(/^.* editor set \S+ /, '')),
  }));
};

const PLAIN = "neutral '#777777'";
const T = 300_000;

describe('a hue said of the grays', () => {
  it(
    'keeps its own reading',
    async test => {
      needsBases(test);
      for (const q of [
        'neutral grays with a hint of blue',
        'neutral grays with a hint of blue in them',
        'neutral grays with a touch of warmth',
        'neutral grays, slightly blue',
        'neutral grays, but warmer',
        'neutral grays but a little cooler',
        'neutral grays but with a hint of blue',
        'neutral grays but blue-ish',
        'neutral grays, but darker',
        'warmish neutral grays',
        'coolish neutral grays',
        // (An amount of a hue said with the grays is said of them.)
        'neutral grays with 10% blue',
      ]) {
        const warm = await answer(q, 'warm');
        expect(
          warm.flatMap(r => r.lines),
          q,
        ).not.toContain(PLAIN);
        const plain = await answer(q, 'plain');
        expect(
          plain.some(r => /already neutral/.test(r.text)),
          q,
        ).toBe(false);
      }
    },
    T,
  );

  it(
    "leaves the plain gray when what follows names another part's color",
    async test => {
      needsBases(test);
      for (const q of [
        'neutral grays with blue buttons',
        'neutral grays with buttons in blue',
        'neutral grays with blue accents',
        'neutral grays, red for errors',
        'neutral grays, red buttons',
      ]) {
        const warm = await answer(q, 'warm');
        expect(
          warm.flatMap(r => r.lines),
          q,
        ).toContain(PLAIN);
      }
    },
    T,
  );
});
