// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how`: a color said to the whole theme is the accent. That
 * covers a color said alone, said through a verb to the whole theme ("make
 * it blue", "it should be blue"), and a color said with a branded look ("a
 * purple branded portal"). A color said right before the theme's color
 * word with a part ("blue accent buttons") is the accent's color: never
 * dropped for the part's plain accent. A color typed beside the theme's
 * color word ("the top bar our brand color #1e3a8a") is the value written.
 * A color said for a part stays on that part.
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
  cwd = makeLinkedFixture('astryx-theme-how-accent-said-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) return;
  await themeEditNew('n', {cwd, like: 'neutral'});
}, 600_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** Every set line the answer offers, after the theme name. @param {string} q */
const sets = async q => {
  const {data} = await themeEditHow(q, {cwd, theme: 'n'});
  return (data.results ?? [])
    .flatMap(r => r.commands)
    .filter(c => / editor set /.test(c))
    .flatMap(c => c.split(' && '))
    .map(c => c.replace(/^.* editor set \S+ /, ''));
};

describe('a color said to the whole theme', () => {
  for (const q of [
    'Make it blue.',
    'it should be blue',
    'A purple branded portal where people submit questions',
  ])
    it(`"${q}" sets the accent`, async ctx => {
      if (unbuilt) return ctx.skip();
      const lines = await sets(q);
      expect(lines.some(l => /^accent '#/.test(l))).toBe(true);
    }, 240_000);
});

describe('a color said before the accent word with a part', () => {
  it('"blue accent buttons" sets the accent blue, and keeps the parts on it', async ctx => {
    if (unbuilt) return ctx.skip();
    const lines = await sets('blue accent buttons');
    expect(lines).toContain("accent '#2563eb'");
    expect(lines.some(l => /var\(--color-accent\)/.test(l))).toBe(true);
  }, 240_000);

  it('"make the buttons blue" keeps the color on the buttons, never the accent', async ctx => {
    if (unbuilt) return ctx.skip();
    const lines = await sets('make the buttons blue');
    expect(
      lines.some(l => /^background-color '#2563eb' --on button/.test(l)),
    ).toBe(true);
    expect(lines.some(l => /^accent /.test(l))).toBe(false);
  }, 240_000);

  it('"make it bigger" names no color and writes no accent', async ctx => {
    if (unbuilt) return ctx.skip();
    const lines = await sets('make it bigger');
    expect(lines.some(l => /^accent /.test(l))).toBe(false);
  }, 240_000);
});

describe("a color typed beside the theme's color word", () => {
  it('"the top bar our brand color #1E3A8A with white text" fills the top bar with it', async ctx => {
    if (unbuilt) return ctx.skip();
    const lines = await sets(
      'Give the top bar our brand color #1E3A8A with white text.',
    );
    expect(lines).toContain("background-color '#1e3a8a' --on app-shell-header");
    expect(
      lines.some(l =>
        /^--color-text-primary '#ffffff' --on app-shell-header$/.test(l),
      ),
    ).toBe(true);
  }, 240_000);
});
