// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how`: a whole look said in words or by a picture. A
 * picture given as the look to match is answered with what to say of it
 * (how reads words, never a picture), never read as the app's own photos.
 * A product said to be dark ("a dark editorial analytics dashboard") is a
 * dark theme, as "a dark theme" is; a page said dark is still the page.
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
  cwd = makeLinkedFixture('astryx-theme-how-whole-look-', FIXTURE_PACKAGES);
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
  return {
    text: results.map(r => r.text).join('\n'),
    sets: results
      .flatMap(r => r.commands)
      .filter(c => / editor set /.test(c))
      .flatMap(c => c.split(' && '))
      .map(c => c.replace(/^.* editor set \S+ /, '')),
  };
};

describe('a picture given as the look', () => {
  it('says what to describe, with a line to start from, and writes nothing', async ctx => {
    if (unbuilt) return ctx.skip();
    const a = await answer(
      'make our app look like this picture: ./look.png (match the look: colors, fonts, corners, spacing; not the layout)',
    );
    expect(a.text).toMatch(/how reads words, never a picture/);
    expect(a.text).not.toMatch(/no part is called/);
    expect(a.sets).toEqual([]);
  }, 240_000);

  it("the app's own photos are still said as photos", async ctx => {
    if (unbuilt) return ctx.skip();
    expect((await answer('rounded photos')).text).toMatch(
      /no part is called "photos"/,
    );
  }, 240_000);
});

describe('a product said to be dark', () => {
  it('"dark editorial analytics dashboard" is a dark theme', async ctx => {
    if (unbuilt) return ctx.skip();
    expect((await answer('dark editorial analytics dashboard')).sets).toContain(
      'mode dark-only',
    );
  }, 240_000);

  it('"dark page" is still the page, and "the dark side of the app" no mode', async ctx => {
    if (unbuilt) return ctx.skip();
    expect((await answer('dark page')).sets).not.toContain('mode dark-only');
    expect((await answer('the dark side of the app')).sets).not.toContain(
      'mode dark-only',
    );
  }, 240_000);
});
