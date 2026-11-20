// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How answers held to what the theme shows now: a bound already
 * passed the way asked writes nothing (a part, the corners dial, the base
 * text size, the body line height), a heading's letter spacing is held to
 * an em bound, a part grows taller or wider by a length from its own
 * height and padding, a selected row steps the token Core paints it with,
 * a part compared with one that shows the page takes the page color, a
 * one-mode theme's vibrancy and value questions read the mode it shows,
 * and a theme color with a way is that color made lighter or darker on a
 * fill and a border too.
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

beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-held-bound-passed-writes-',
    FIXTURE_PACKAGES,
  );
  const unbuilt = await installRealBaseThemes(cwd, ['neutral', 'butter']);
  if (unbuilt) throw new Error(unbuilt);
  await themeEditNew('ne', {cwd, like: 'neutral'});
  await themeEditNew('bu', {cwd, like: 'butter'});
  for (const [slug, like, mode] of [
    ['ndo', 'neutral', 'dark-only'],
    ['nlo', 'neutral', 'light-only'],
    ['blo', 'butter', 'light-only'],
  ]) {
    await themeEditNew(slug, {cwd, like});
    await themeEditSet(slug, 'mode', mode, {cwd});
  }
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/**
 * The answers to an ask: each result's text and commands, as the editor
 * prints them (without the runner).
 * @param {string} theme @param {string} ask
 */
const how = async (theme, ask) => {
  const {data} = /** @type {any} */ (await themeEditHow(ask, {cwd, theme}));
  return /** @type {Array<{text: string, commands: string[]}>} */ (
    data.results ?? []
  ).map(r => ({
    text: r.text,
    commands: r.commands.map(c => c.replace(/^.*? editor /, '')),
  }));
};

/** The commands that write, of every answer. @param {Array<{commands: string[]}>} rs */
const writes = rs =>
  rs.flatMap(r => r.commands).filter(c => /^(set|undo) /.test(c));

describe('a bound already passed the way asked writes nothing', () => {
  it.each([
    ['make input borders thinner but at least 2px', /border-width 1px now/],
    ['make the text bigger but no bigger than 12px', /base text size/],
    ['make the text smaller but at least 16px', /base text size/],
    ['make the corners rounder but at most 4px', /the corners are/],
    ['make the corners sharper but at least 16px', /the corners are/],
    ['make the line height bigger but at most 1.2', /body line height/],
    ['make the line height smaller but at least 1.6', /body line height/],
    ['make corners rounder but at most 0px', /the corners are/],
    ['make borders thicker but no more than 0px', /shared border width/],
    ['make card padding smaller but no less than 64px', /card has padding/],
  ])(
    '%s',
    async (ask, what) => {
      const rs = await how('ne', ask);
      expect(writes(rs), ask).toEqual([]);
      expect(rs[0].text).toMatch(what);
      expect(rs[0].text).toMatch(/leaves nothing to change/);
    },
    120_000,
  );

  it('writes nothing for a way beside a bound on a length the part does not have', async () => {
    const rs = await how('ne', 'make cards wider but at most 300px');
    expect(writes(rs)).toEqual([]);
    expect(rs[0].text).toMatch(/card has no width of its own/);
  }, 120_000);

  it('still moves toward a bound not yet reached', async () => {
    // (The bound holds every radius the dial writes: the container's and
    // the page's, which the dial makes larger, are held at it.)
    expect(
      writes(await how('ne', 'make the corners rounder but at most 20px')),
    ).toEqual([
      'set ne corners 20px',
      'set ne --radius-container 20px',
      'set ne --radius-page 20px',
    ]);
  }, 120_000);
});

describe("headings' letter spacing", () => {
  it('is held to an em bound, and never changes the theme spacing', async () => {
    const bound = writes(
      await how('ne', 'make headings tighter but no tighter than -0.01em'),
    );
    expect(bound).toEqual(['set ne letter-spacing -0.01em --on heading']);
    expect(writes(await how('ne', 'make headings tighter'))).toEqual([
      'set ne headings tight',
    ]);
  }, 120_000);
});

describe('a part taller or wider by a length', () => {
  it('reads its height, and its inline padding half on each side', async () => {
    // (Each control height the button reads, so every size keeps its own.)
    expect(writes(await how('ne', 'make buttons 4px taller'))).toEqual([
      'set ne --size-element-md 36px --on button',
      'set ne --size-element-sm 32px --on button',
    ]);
    const wider = writes(await how('ne', 'make buttons 8px wider'));
    expect(wider).toHaveLength(1);
    expect(wider[0]).toMatch(/^set ne padding '\S+ 16px' --on button$/);
  }, 120_000);
});

describe('a selected row lighter or darker', () => {
  it('steps the token Core paints the row with when selected', async () => {
    const w = writes(
      await how('ne', 'make selected rows lighter in dark mode'),
    );
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(
      /^set ne --color-accent-muted '#[0-9a-f]{6}' --on table-row --state selected --mode dark$/,
    );
  }, 120_000);
});

describe('the same color as a part with no fill of its own', () => {
  it('takes the page color that part shows', async () => {
    expect(
      writes(await how('ne', 'make the header the same color as the sidebar')),
    ).toEqual([
      "set ne background-color 'var(--color-background-body)' --on app-shell-header",
    ]);
  }, 120_000);
});

describe("another part's color named as a value", () => {
  it.each([
    [
      'make the sidebar the page color but darker',
      'side-nav',
      '--color-background-body',
    ],
    ['make cards the page color but darker', 'card', '--color-background-body'],
    [
      'make the header the card color but darker',
      'app-shell-header',
      '--color-background-card',
    ],
  ])(
    '%s: that color made darker, never a change to it',
    async (ask, on, from) => {
      const rs = await how('ne', ask);
      expect(rs[0].text).toContain(`${from} made darker`);
      const w = writes(rs);
      expect(w).toHaveLength(2);
      for (const c of w)
        expect(c).toMatch(
          new RegExp(
            `^set ne background-color '#[0-9a-f]{6}' --on ${on} --mode (light|dark)$`,
          ),
        );
    },
    120_000,
  );
});

describe('a one-mode theme', () => {
  it('answers "more colorful" with the first vibrancy that makes its accents more saturated', async () => {
    const w = writes(await how('blo', 'make it more colorful'));
    expect(w[0]).toMatch(/^set blo accent '#[0-9a-f]{6}'$/);
    expect(w).toHaveLength(2);
    // The first step that makes them more saturated: under the newest
    // palette recipe one step (more) already does.
    expect(w[1]).toMatch(/^set blo vibrancy (more|60|70|80|90|100)$/);
  }, 120_000);

  it('tells the value of the mode it shows, and none for a mode it never shows', async () => {
    const dark = await how('ndo', 'what color are cards');
    expect(dark[0].text).toMatch(/card has background-color #1b1b1b now/);
    const none = await how('nlo', 'what color are cards in dark mode');
    expect(none[0].text).toMatch(
      /nlo has only a light mode, so card has no background-color in dark mode/,
    );
    expect(writes(none)).toEqual([]);
  }, 120_000);
});

describe('a theme color with a way', () => {
  it.each([
    'make the card background the accent color but lighter',
    'make the card background the accent color, but lighter',
  ])(
    '%s: the accent made lighter in each mode, as the fill',
    async ask => {
      const rs = await how('bu', ask);
      expect(rs[0].text).toMatch(/--color-accent made lighter/);
      const w = writes(rs);
      expect(w).toHaveLength(2);
      for (const c of w)
        expect(c).toMatch(
          /^set bu background-color '#[0-9a-f]{6}' --on card --mode (light|dark)$/,
        );
      expect(w.join(' ')).not.toMatch(/var\(--color-accent\)/);
    },
    120_000,
  );

  it('reads a status color named as a color', async () => {
    const rs = await how('ne', 'make cards the danger color but darker');
    expect(rs[0].text).toMatch(/--color-error made darker/);
    expect(writes(rs)).toHaveLength(2);
  }, 120_000);

  it('makes a border the theme color darker too', async () => {
    const rs = await how(
      'bu',
      'make the card border the accent color but darker',
    );
    expect(rs[0].text).toMatch(
      /the border color on card: --color-accent made darker/,
    );
    expect(writes(rs)).toHaveLength(2);
  }, 120_000);
});
