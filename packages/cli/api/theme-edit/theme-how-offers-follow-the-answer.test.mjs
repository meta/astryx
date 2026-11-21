// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file An offer in an `editor how` answer (more than the ask, such as the
 * colored card variants changed too) is marked `offer: true`, follows every
 * other result, and is never the first result: running the first result's
 * commands, the documented path, never runs an offer. Where what the ask
 * writes is in place already, the first result says so with no command.
 *
 * @position api/theme-edit — tests
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
/** Why a bundled base could not be installed here, when one could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-how-offers-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) return;
  await themeEditNew('fresh', {cwd, like: 'neutral'});
  await themeEditNew('white', {cwd, like: 'neutral'});
  await themeEditNew('lo', {cwd, like: 'neutral'});
  await themeEditSet('lo', 'mode', 'light-only', {cwd});
  for (const v of ['default', 'transparent', 'muted'])
    await themeEditSet('white', 'background-color', '#ffffff', {
      cwd,
      on: 'card',
      when: `variant:${v}`,
      mode: 'light',
    });
}, 600_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** @param {string} theme @param {string} q */
const results = async (theme, q) =>
  /** @type {Array<{text: string, commands: string[], offer?: boolean}>} */ (
    (await themeEditHow(q, {cwd, theme})).data.results ?? []
  );

describe('offers follow the answer', () => {
  it.each(['fresh', 'white'])(
    'on %s, the first result never runs an offer, and offers come last',
    async (theme, test) => {
      if (unbuilt) {
        console.warn(`skipped: ${unbuilt}`);
        test.skip();
      }
      const r = await results(theme, 'card background #ffffff');
      const offers = r.filter(x => x.offer);
      expect(offers.length).toBeGreaterThan(0);
      expect(r[0].offer).toBeUndefined();
      const offered = new Set(offers.flatMap(x => x.commands));
      for (const c of r[0].commands) expect(offered.has(c)).toBe(false);
      for (const c of r[0].commands) expect(c).not.toMatch(/variant:blue/);
      const firstOffer = r.findIndex(x => x.offer);
      expect(r.slice(firstOffer).every(x => x.offer)).toBe(true);
    },
    300_000,
  );

  it('says the asked value is in place already, first, with no command', async test => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      test.skip();
    }
    const r = await results('white', 'card background #ffffff');
    expect(r[0].text).toMatch(
      /^already #ffffff on the card in white, nothing to change/,
    );
    expect(r[0].commands).toEqual([]);
  }, 300_000);

  it('the line that drops a mode is offered, never in the whole', async test => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      test.skip();
    }
    const r = await results(
      'fresh',
      'warm sand page background in light mode, relaxed dark mode for night browsing',
    );
    const dropping = r.filter(x =>
      x.commands.some(c => / mode dark-only$/.test(c)),
    );
    expect(dropping.length).toBeGreaterThan(0);
    for (const x of dropping) expect(x.offer).toBe(true);
    expect(r[0].commands.some(c => / --color-background-body /.test(c))).toBe(
      true,
    );
  }, 300_000);

  it('a light-only theme names the dark media surfaces a color leaves', async test => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      test.skip();
    }
    const r = await results('lo', 'high contrast');
    expect(r[0].text).toMatch(
      /lo is light only: dark mode keeps its own value for --color-text-secondary \(now [^)]+\), --color-border \(now [^)]+\), which Core's dark media surfaces \(lightbox, overlay-scrim\) draw/,
    );
    expect(r[0].commands.some(c => /--mode dark/.test(c))).toBe(false);
  }, 300_000);

  it('names only the tokens dark media surfaces read through their own dark half, and the line that keeps it', async test => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      test.skip();
    }
    // The dark media rule draws the main text color and the accent in
    // --color-on-dark, so their dark halves are never what the lightbox
    // shows: no note names them.
    for (const q of ['accent #2563eb', 'main text #333333']) {
      const text = (await results('lo', q)).map(x => x.text).join('\n');
      expect(text, q).not.toMatch(/dark media surfaces/);
      expect(text, q).not.toMatch(
        /--color-accent \(now|--color-text-primary \(now/,
      );
    }
    // A dial's line makes the dark shades too: the note names the line
    // that keeps them, the one that sets the token alone.
    const neutral = (await results('lo', 'neutral #64748b'))[0].text;
    expect(neutral).toMatch(
      /with the line that sets the token alone, dark mode keeps its own value for --color-neutral \(now [^)]+\)/,
    );
    // A line of token and part settings keeps the token's dark half itself.
    const page = (await results('lo', 'page #fafafa'))[0].text;
    expect(page).toMatch(
      /lo is light only: dark mode keeps its own value for --color-background-body \(now [^)]+\)/,
    );
    // What it says is what the line does: dark mode keeps the token's own
    // dark value.
    const before = (
      await themeEditHow('secondary text #555555', {cwd, theme: 'lo'})
    ).data.results[0].text.match(/--color-text-secondary \(now ([^)]+)\)/)?.[1];
    await themeEditSet('lo', '--color-text-secondary', '#555555', {cwd});
    const fs = await import('node:fs');
    const path = await import('node:path');
    const css = fs.readFileSync(path.join(cwd, 'themes/lo/lo.css'), 'utf8');
    expect(css).toContain(
      `--color-text-secondary: light-dark(#555555, ${before});`,
    );
  }, 300_000);
});

describe('light and dark said as what the theme must work in', () => {
  it('asks for both modes at the end of the ask or its clause, never mid-clause', async () => {
    const lines = async (/** @type {string} */ q) =>
      (await results('lo', q)).flatMap(r =>
        r.commands.map((/** @type {string} */ c) =>
          c.replace(/^.*? editor /, ''),
        ),
      );
    for (const q of [
      'make sure it works in light and dark mode',
      'the theme should work in light and dark mode',
      'please make it work in light and dark mode',
      'a navy theme that works in light and dark',
      'a navy theme that should work in light and dark mode',
      'works in light and dark',
      'works in light and dark mode',
      'looks good in dark and light modes',
      'should work in light and dark mode',
      'it needs to look good in dark and light',
    ])
      expect(await lines(q), q).toContain('set lo mode both');
    // (Said before more of its clause, it only qualifies that clause.)
    const text = await lines(
      'text that must work in light and dark mode should be #111111',
    );
    expect(text).toContain(`set lo --color-text-primary '#111111'`);
    expect(text).not.toContain('set lo mode both');
    const headings = await lines(
      'headings that work in light and dark mode should be navy',
    );
    expect(headings).not.toContain('set lo mode both');
    expect(headings.join('\n')).not.toMatch(/headings light/);
    // (The heading's text takes the color; nothing reads a weight in it.)
    expect(headings.join('\n')).toMatch(/color '#1e3a8a' --on heading/);
    expect(headings.join('\n')).not.toMatch(/font-weight|headings bold/);
    // (On a theme that draws both modes, the color is for both: a light
    // one is not kept to light mode.)
    const cards = (
      await results(
        'fresh',
        'cards that hold up in light and dark mode should be white',
      )
    ).flatMap(r => r.commands);
    expect(cards.join('\n')).toMatch(/'#ffffff' --on card/);
    expect(cards.join('\n')).not.toMatch(/--mode light/);
    // ("must work" is no plural part said to work: the text is kept to the
    // mode it reads in, as before.)
    const must = (
      await results(
        'fresh',
        'text that must work in light and dark mode should be #111111',
      )
    ).flatMap(r => r.commands);
    expect(must.join('\n')).toMatch(
      /--color-text-primary '#111111' --mode light/,
    );
    // (Said to be usable in both modes, a color one page makes hard to
    // read is written for both, with a note naming that mode and the
    // ratio.)
    const links = await results(
      'fresh',
      'links that are usable in light and dark mode should be navy',
    );
    const linkLines = links.flatMap(r => r.commands).join('\n');
    expect(linkLines).toMatch(/'#1e3a8a'/);
    expect(linkLines).not.toMatch(/'#1e3a8a'[^\n]*--mode/);
    expect(links.map(r => r.text).join('\n')).toMatch(
      /#1e3a8a reads \d+\.\d\d:1 on the dark page \(under 4\.5:1\); for dark mode, set a lighter color with --mode dark/,
    );
    // (A modal before the verb leaves the number to the part: a plural
    // part, "headings that could work …", is still both modes.)
    const could = (
      await results(
        'fresh',
        'headings that could work in light and dark mode should be navy',
      )
    ).flatMap(r => r.commands);
    expect(could.join('\n')).toMatch(/color '#1e3a8a' --on heading/);
    expect(could.join('\n')).not.toMatch(/headings bold/);
    const modes = (
      await results(
        'fresh',
        'headings that work in light and dark modes should be navy',
      )
    ).flatMap(r => r.commands);
    expect(modes.join('\n')).toMatch(/color '#1e3a8a' --on heading/);
    // (A singular part after a modal keeps the base reading, "modes" too.)
    const would = (
      await results(
        'fresh',
        'text that would work in light and dark modes should be #111111',
      )
    ).flatMap(r => r.commands);
    expect(would.join('\n')).toMatch(/#111111/);
    // (Text on a part's own fill, a button's, is not measured against the
    // page.)
    const buttons = await results(
      'fresh',
      'buttons that work in light and dark mode should have white text',
    );
    expect(buttons.map(r => r.text).join('\n')).not.toMatch(
      /reads \d+\.\d\d:1 on the light page/,
    );
  }, 300_000);
  it('asks for nothing when "not" comes before it', async () => {
    for (const q of [
      "it doesn't need to work in light and dark mode",
      "don't make it work in light and dark mode",
      "make the buttons blue, it doesn't need to work in light and dark mode",
    ])
      expect(JSON.stringify(await results('lo', q)), q).not.toMatch(
        /mode both/,
      );
  }, 240_000);
});
