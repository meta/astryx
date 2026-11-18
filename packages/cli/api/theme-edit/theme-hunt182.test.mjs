// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How holds what an ask measures to what the part draws: a part's
 * border at a contrast ratio against what it sits on (its own ink, else a
 * deeper shade of it); a part's text, border or fill, or the shared
 * shadows, made N% more transparent from each color's own alpha; a value
 * question that names no part reads the theme's token (corners, spacing,
 * fonts, borders, a status color); a theme color named as the reference
 * ("the color of the text", "of the danger"); a part that draws no
 * shadow of its own at rest says so when asked for a softer one; a
 * gradient to transparent keeps its typed stop; a fill question reads
 * the state it names; a typed weight is the weight; a question never
 * writes; sharper shadows have less blur; and heavier borders are wider.
 */

import fs from 'node:fs';
import path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import {alphaOf, parseColor, ratio} from './_color.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-hunt182-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, ['neutral', 'butter']);
  if (unbuilt) throw new Error(unbuilt);
  await themeEditNew('ne', {cwd, like: 'neutral'});
  await themeEditNew('bu', {cwd, like: 'butter'});
  await themeEditNew('ndo', {cwd, like: 'neutral'});
  await themeEditSet('ndo', 'mode', 'dark-only', {cwd});
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

/**
 * A page token's value in the built CSS of ne, in a mode.
 * @param {string} token @param {'light' | 'dark'} mode
 */
const valueOf = (token, mode) => {
  const css = fs.readFileSync(path.join(cwd, 'themes/ne/ne.css'), 'utf8');
  const v = new RegExp(`${token}:\\s*([^;]+);`).exec(css)?.[1]?.trim() ?? '';
  const pair = /^light-dark\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)$/.exec(v);
  return pair ? (mode === 'light' ? pair[1] : pair[2]) : v;
};

/**
 * The contrast of a border color drawn over a ground.
 * @param {string} ink @param {string} ground
 */
const seen = (ink, ground) => {
  const over = /** @type {number[]} */ (parseColor(ink));
  const under = /** @type {number[]} */ (parseColor(ground));
  const a = alphaOf(ink);
  return ratio(
    over.map((x, i) => x * a + under[i] * (1 - a)),
    under,
  );
};

describe('a part border at a contrast ratio', () => {
  it.each([
    ['make input borders 3:1 contrast', 'inputs', '--color-background-surface'],
    ['make card borders 3:1 contrast', 'card', '--color-background-card'],
  ])(
    '%s: measures 3:1 on the page and its own fill',
    async (ask, on, fill) => {
      const w = writes(await how('ne', ask)).filter(
        c =>
          c.startsWith(`set ne border-color '#`) &&
          !c.includes('--when') &&
          !c.includes('--state'),
      );
      expect(w).toHaveLength(2);
      for (const m of /** @type {const} */ (['light', 'dark'])) {
        const step = w.find(c => c.endsWith(`--on ${on} --mode ${m}`)) ?? '';
        const ink = /'(#[0-9a-f]{6,8})'/.exec(step)?.[1] ?? '';
        for (const g of ['--color-background-body', fill])
          expect(seen(ink, valueOf(g, m))).toBeGreaterThanOrEqual(3);
      }
    },
    120_000,
  );

  it('measures against the part named after "against"', async () => {
    const rs = await how(
      'ne',
      'make input borders 3:1 contrast against the page',
    );
    expect(rs[0].text).toMatch(/against --color-background-body \(/);
    expect(rs.map(r => r.text).join('\n')).not.toMatch(/but not/);
  }, 120_000);
});

describe("N% more transparent, from each color's own alpha", () => {
  it("scales a card's text tokens on the card, never its opacity", async () => {
    const w = writes(
      await how('ne', 'make the card text 50% more transparent'),
    );
    expect(w).toContain(
      "set ne --color-text-primary '#00000080' --on card --mode light",
    );
    expect(w.some(c => / opacity /.test(c))).toBe(false);
  }, 120_000);

  it("scales a card's border color", async () => {
    expect(
      writes(await how('ne', 'make the card border 50% more transparent')),
    ).toEqual([
      "set ne border-color '#0000000a' --on card --mode light",
      "set ne border-color '#ffffff0d' --on card --mode dark",
    ]);
  }, 120_000);

  it('scales each variant of a button text on its own', async () => {
    const w = writes(await how('ne', 'make button text 20% less opaque'));
    expect(w.some(c => c.includes('--when variant:primary'))).toBe(true);
    expect(w.some(c => c.includes('--when variant:secondary'))).toBe(true);
  }, 120_000);

  it('scales every shared shadow', async () => {
    const w = writes(await how('ne', 'make all shadows 50% more transparent'));
    expect(w.length).toBeGreaterThanOrEqual(2);
    expect(w[0]).toMatch(/^set ne --shadow-low '.*oklch\(0 0 0 \/ 2\.5%\)/);
  }, 120_000);
});

describe('a value question that names no part', () => {
  it.each([
    [
      'what is the corner radius',
      /corner radius of ne is 0\.625rem \(--radius-element\)/,
    ],
    ['how round are corners', /corner radius of ne is/],
    ['what is the spacing', /base spacing step .* is 1rem \(--spacing-4\)/],
    ['what font is used', /body font of ne is .*\(--font-family-body\)/],
    [
      'what is the border width',
      /border width of ne is 1px \(--border-width\)/,
    ],
    [
      'what color is the danger',
      /danger color of ne is \S+ in light mode, \S+ in dark mode \(--color-error\)/,
    ],
  ])(
    '%s',
    async (ask, want) => {
      const rs = await how('ne', ask);
      expect(writes(rs)).toEqual([]);
      expect(rs[0].text).toMatch(want);
    },
    120_000,
  );

  it('reads the one mode a theme shows', async () => {
    const rs = await how('ndo', 'what color is the border');
    expect(rs[0].text).toMatch(
      /border color of ndo is #ffffff1a \(--color-border\)/i,
    );
  }, 120_000);

  it('answers a heading font question with its value', async () => {
    const rs = await how('ne', 'what is the heading font');
    expect(writes(rs)).toEqual([]);
    expect(rs[0].text).toMatch(/^heading has font-family /);
  }, 120_000);
});

describe('a theme color named as the reference', () => {
  it.each([
    ['make links the color of the text', 'var(--color-text-primary)'],
    ['make links the same color as the text', 'var(--color-text-primary)'],
    ['make badges the color of the danger', 'var(--color-error)'],
  ])(
    '%s',
    async (ask, value) => {
      const w = writes(await how('ne', ask));
      expect(w).toHaveLength(1);
      expect(w[0]).toContain(`'${value}'`);
    },
    120_000,
  );
});

describe('a softer shadow on a part that draws none at rest', () => {
  it('says so instead of a false reason', async () => {
    const rs = await how('ne', 'make card shadows lighter');
    expect(writes(rs)).toEqual([]);
    expect(rs[0].text).toMatch(/card draws no shadow of its own at rest/);
    expect(rs[0].text).not.toMatch(/would get stronger/);
  }, 120_000);
});

describe('a gradient to transparent', () => {
  it.each([
    [
      'make cards a gradient from #ff0000 to transparent in dark mode',
      "set bu background-image 'linear-gradient(#ff0000, transparent)' --on card --mode dark",
    ],
    [
      'make primary buttons a gradient from the accent color to transparent in light mode',
      "set bu background-image 'linear-gradient(var(--color-accent), transparent)' --on button --when variant:primary --mode light",
    ],
  ])(
    '%s: keeps the typed stop',
    async (ask, want) => {
      expect(writes(await how('bu', ask))).toEqual([want]);
    },
    120_000,
  );
});

describe('a fill question in a state', () => {
  it.each([
    [
      'what is the background of ghost buttons in dark mode',
      /button has background-color transparent in dark mode \(ghost\) now/,
    ],
    [
      'what is the hover background of ghost buttons in dark mode',
      /transparent with #f3f2e20d \(--color-overlay-hover\) drawn over it when hovered/,
    ],
    [
      'what is the pressed background of ghost buttons in dark mode',
      /transparent with #f3f2e21a \(--color-overlay-pressed\) drawn over it when pressed/,
    ],
  ])(
    '%s',
    async (ask, want) => {
      const rs = await how('bu', ask);
      expect(writes(rs)).toEqual([]);
      expect(rs[0].text).toMatch(want);
    },
    120_000,
  );
});

describe('more of what an ask says, read as said', () => {
  it('borders N% more transparent move the border color, never the width', async () => {
    expect(
      writes(await how('ne', 'make borders 30% more transparent')),
    ).toEqual([
      "set ne --color-border '#0000000e' --mode light",
      "set ne --color-border '#ffffff12' --mode dark",
    ]);
  }, 120_000);

  it('the shadow N% more opaque scales every shared shadow up', async () => {
    const w = writes(await how('ne', 'make the shadow 20% more opaque'));
    expect(w[0]).toMatch(/^set ne --shadow-low '.*oklch\(0 0 0 \/ 6%\)/);
  }, 120_000);

  it('the accent N% more transparent scales its alpha', async () => {
    expect(
      writes(await how('ne', 'make the accent 50% more transparent')),
    ).toHaveLength(2);
  }, 120_000);

  it('a typed weight that is not a hundred is the weight', async () => {
    expect(writes(await how('ne', 'make body font weight 450'))).toEqual([
      'set ne --text-body-weight 450',
    ]);
  }, 120_000);

  it.each(['how dense is it', 'what is the density'])(
    '%s: answers, writes nothing',
    async ask => {
      const rs = await how('ne', ask);
      expect(writes(rs)).toEqual([]);
      expect(rs[0].text).toMatch(/base spacing step/);
    },
    120_000,
  );

  it('sharper shadows halve the blur, never soften', async () => {
    const rs = await how('ne', 'make shadows sharper');
    expect(rs[0].text).toMatch(/^sharper shadows everywhere: .*blur ×0\.5/);
    const dark = await how('ne', 'make shadows sharper in dark mode');
    expect(writes(dark)).toEqual([]);
  }, 120_000);

  it('heavier borders with words between are wider, with no false line', async () => {
    const rs = await how('ne', 'make the borders on cards heavier');
    expect(writes(rs)).toContain('set ne border-width 2px --on card');
    expect(rs.map(r => r.text).join('\n')).not.toMatch(/but not "borders"/);
  }, 120_000);
});
