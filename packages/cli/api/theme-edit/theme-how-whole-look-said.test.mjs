// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how`: a whole look said in words or by a picture. A
 * picture given as the look to match is answered with what to say of it
 * (how reads words, never a picture), never read as the app's own photos.
 * A product said to be dark ("a dark editorial analytics dashboard") is a
 * dark theme, as "a dark theme" is; a page said dark is still the page.
 * A look named for the whole theme and said bare ("cozy warm vibe") takes
 * the words a setting reads and names the rest; a look named for
 * something how cannot see ("whatsapp theme") asks for its colors as hex,
 * never guessing them. A built-in theme named as the look ("the butter
 * look", "base butter") is the base dial.
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
  unbuilt = await installRealBaseThemes(cwd, ['neutral', 'butter']);
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

  it('a picture named by its file alone, "our brand board: ./look.png", is a picture too', async ctx => {
    if (unbuilt) return ctx.skip();
    expect(
      (
        await answer(
          'here is our brand board: ./look.png. Make our app follow it.',
        )
      ).text,
    ).toMatch(/how reads words, never a picture/);
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

describe('a look named for the whole theme, said bare', () => {
  it('"cozy warm vibe" takes warm and names cozy', async ctx => {
    if (unbuilt) return ctx.skip();
    const a = await answer('cozy warm vibe');
    expect(a.sets.some(l => /^neutral '#/.test(l))).toBe(true);
    expect(a.text).toMatch(/not taken: "cozy": no setting reads this word/);
    expect(a.text).not.toMatch(/"warm"/);
  }, 240_000);

  it('"minimal theme", "playful theme": a describing word is never taken for a brand', async ctx => {
    if (unbuilt) return ctx.skip();
    for (const q of ['minimal theme', 'playful theme'])
      expect((await answer(q)).text).not.toMatch(/never guesses a brand/);
  }, 240_000);

  it('"whatsapp theme" asks for its colors and writes nothing', async ctx => {
    if (unbuilt) return ctx.skip();
    const a = await answer('whatsapp theme');
    expect(a.text).toMatch(
      /how does not know what "whatsapp" looks like and never guesses a brand's colors: say its colors \(the accent, the page, the text, as hex\)/,
    );
    expect(a.sets).toEqual([]);
  }, 240_000);
});

describe('a built-in theme named as the look', () => {
  it('"start from the butter look" and "base butter" answer with the base', async ctx => {
    if (unbuilt) return ctx.skip();
    // (how names the change of base; set checks it, as it checks every
    // base.)
    for (const q of ['start from the butter look', 'base butter'])
      expect((await answer(q)).text).toMatch(
        /the base: n builds on butter, and every setting it has is kept/,
      );
  }, 240_000);

  it('"make the buttons chocolate" is no base', async ctx => {
    if (unbuilt) return ctx.skip();
    expect(
      (await answer('make the buttons chocolate')).sets.some(l =>
        /^base /.test(l),
      ),
    ).toBe(false);
  }, 240_000);
});
