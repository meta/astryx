// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How reads what a question asks of the theme as it is: "the color of
 * the page" is a color to take, never a page to change; a shadow made N%
 * more transparent scales each layer's own alpha; a border contrast ratio
 * is met against the grounds the border is drawn on; a value question that
 * names no part reads the theme's token; and "more colorful" is judged by
 * how colorful the accents look (OKLCH chroma), so a pale hand-tuned
 * accent can still be made more colorful.
 */

import fs from 'node:fs';
import path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import {parseColor, ratio, alphaOf} from './_color.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-hunt171-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, ['neutral', 'butter']);
  if (unbuilt) throw new Error(unbuilt);
  await themeEditNew('ne', {cwd, like: 'neutral'});
  for (const [slug, like] of [
    ['ndo', 'neutral'],
    ['bdo', 'butter'],
  ]) {
    await themeEditNew(slug, {cwd, like});
    await themeEditSet(slug, 'mode', 'dark-only', {cwd});
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

/**
 * A page token's value in a theme's built CSS, as `[light, dark]`.
 * @param {string} slug @param {string} token
 * @returns {[string, string]}
 */
const valueOf = (slug, token) => {
  const css = fs.readFileSync(
    path.join(cwd, 'themes', slug, `${slug}.css`),
    'utf8',
  );
  const v = new RegExp(`${token}:\\s*([^;]+);`).exec(css)?.[1]?.trim() ?? '';
  const pair = /^light-dark\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)$/.exec(v);
  return pair ? [pair[1], pair[2]] : [v, v];
};

describe('"the color of the page" is a color to take', () => {
  it('gives cards the page color and never changes the page', async () => {
    const w = writes(await how('ne', 'make cards the color of the page'));
    expect(w).toEqual([
      "set ne background-color 'var(--color-background-body)' --on card",
    ]);
  }, 120_000);

  it('steps that color with a way and an amount', async () => {
    const rs = await how(
      'ne',
      'make cards the color of the page but 10% darker',
    );
    expect(rs[0].text).toMatch(/--color-background-body made darker/);
    const w = writes(rs);
    expect(w).toHaveLength(2);
    for (const c of w)
      expect(c).toMatch(
        /^set ne background-color '#[0-9a-f]{6}' --on card --mode (light|dark)$/,
      );
  }, 120_000);
});

describe('a shadow made N% more transparent', () => {
  it("scales each layer's own alpha, in each mode", async () => {
    const rs = await how('ne', 'make dialog shadows 50% more transparent');
    expect(rs[0].text).toMatch(/each layer's alpha 50% lower/);
    const [w] = writes(rs);
    // The layers were 10%/50% and 15%/70%: halved, never one alpha.
    expect(w).toContain('oklch(0 0 0 / 5%), oklch(0 0 0 / 25%)');
    expect(w).toContain('oklch(0 0 0 / 7.5%), oklch(0 0 0 / 35%)');
  }, 120_000);

  it('reads "N% less opaque" the same way', async () => {
    const rs = await how('ne', 'make dialog shadows 20% less opaque');
    expect(writes(rs)[0]).toContain('oklch(0 0 0 / 8%), oklch(0 0 0 / 40%)');
  }, 120_000);

  it('says so for a part that draws no shadow of its own', async () => {
    const rs = await how('ne', 'make card shadows 50% more transparent');
    expect(writes(rs)).toEqual([]);
    expect(rs[0].text).toMatch(/card draws no shadow of its own/);
  }, 120_000);
});

describe('a border contrast ratio', () => {
  it('measures that ratio against the page, surfaces and cards in each mode', async () => {
    const rs = await how('ne', 'make borders 3:1 contrast');
    const w = writes(rs);
    expect(w).toHaveLength(2);
    for (const m of /** @type {const} */ (['light', 'dark'])) {
      const step = w.find(c => c.endsWith(`--mode ${m}`)) ?? '';
      const ink = /'(#[0-9a-f]{8})'/.exec(step)?.[1] ?? '';
      const rgb = /** @type {number[]} */ (parseColor(ink));
      const a = alphaOf(ink);
      for (const g of [
        '--color-background-body',
        '--color-background-surface',
        '--color-background-card',
      ]) {
        const ground = valueOf('ne', g)[m === 'light' ? 0 : 1];
        const under = parseColor(ground);
        if (!under || alphaOf(ground) < 1) continue;
        const seen = rgb.map((x, i) => x * a + under[i] * (1 - a));
        expect(ratio(seen, under)).toBeGreaterThanOrEqual(3);
      }
    }
  }, 120_000);
});

describe('a value question that names no part', () => {
  it.each([
    [
      'ne',
      'what color is the text',
      /main text color of ne is #000000 in light mode, #ffffff in dark mode/,
    ],
    ['ndo', 'what color is the text', /main text color of ndo is #ffffff \(/],
    [
      'ne',
      'what color is the accent',
      /accent color of ne is \S+ in light mode, \S+ in dark mode/,
    ],
    ['ne', 'what is the body text size', /body text size of ne is 0\.875rem/],
  ])(
    '%s %s: reads the token',
    async (theme, ask, want) => {
      const rs = await how(theme, ask);
      expect(writes(rs)).toEqual([]);
      expect(rs[0].text).toMatch(want);
    },
    120_000,
  );
});

describe('a bound on a whole-theme ask', () => {
  it.each([
    [
      'make padding bigger but at most 2px',
      /base spacing step .* already past 2px/,
    ],
    [
      'make the corners square but at least 8px',
      /square corners are 0px, outside the 8px/,
    ],
    [
      'make corners pill but at most 20px',
      /pill corners are 9999px, outside the 20px/,
    ],
  ])(
    '%s: writes nothing',
    async (ask, why) => {
      const rs = await how('ne', ask);
      expect(writes(rs)).toEqual([]);
      expect(rs.map(r => r.text).join('\n')).toMatch(why);
    },
    120_000,
  );
});

describe('a typed shadow color', () => {
  it('sets every shared shadow in it, offsets kept', async () => {
    const rs = await how('ne', 'make shadows use 20% black');
    expect(rs[0].text).toMatch(
      /^the shared shadows in color-mix\(in srgb, black 20%, transparent\)/,
    );
    const w = writes(rs);
    expect(w.length).toBeGreaterThanOrEqual(2);
    for (const c of w)
      expect(c).toMatch(
        /^set ne --shadow-[a-z]+ '0 \d+px \d+px color-mix\(in srgb, black 20%, transparent\)/,
      );
    expect(rs.map(r => r.text).join('\n')).not.toMatch(/but not "shadows"/);
  }, 120_000);

  it('on a part, with no line that it read nothing', async () => {
    const rs = await how('ne', 'make card shadows 20% black');
    expect(writes(rs)).toHaveLength(1);
    expect(rs.map(r => r.text).join('\n')).not.toMatch(/but not "shadows"/);
  }, 120_000);
});

describe('"more colorful" on a pale hand-tuned accent', () => {
  it('raises the vibrancy, judged by how colorful the accents look', async () => {
    const w = writes(await how('bdo', 'make it more colorful'));
    expect(w[0]).toBe("set bdo accent '#fdee8c'");
    expect(w[1]).toMatch(/^set bdo vibrancy (more|\d+)$/);
  }, 120_000);
});
