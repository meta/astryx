// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Neutral grays ("neutral grays", "make the grays neutral", "pure
 * neutral grays, no tint") are grays with no hue of their own. On a theme
 * whose grays already have none, how says so and writes nothing; on a
 * tinted one (a warm gray), it gives the neutral color as a plain gray, and
 * the page, surfaces and secondary text lose their tint in both modes. The
 * hover tint is never the answer, and an ask turned away from the grays
 * writes nothing; a tint the theme sets itself is named. A gray given a
 * hue ("cool neutral grays") or a typed color keeps its own reading, and
 * the clause keeps its line at the end of a long ask, while change lines
 * still come before lookups.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import {oklabOf, parseColor} from './_color.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-neutral-grays-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (!unbuilt) {
    await themeEditNew('plain', {cwd, like: 'neutral'});
    await themeEditNew('warm', {cwd, like: 'neutral'});
    await themeEditSet('warm', 'neutral', '#78716c', {cwd});
    await themeEditNew('cream', {cwd, like: 'neutral'});
    await themeEditSet('cream', '--color-background-body', '#faf3e8', {cwd});
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

/**
 * The OKLab chroma of each mode's value of a token in a theme's build.
 * @param {string} theme @param {string} token
 */
const chromas = (theme, token) => {
  const css = fs.readFileSync(
    path.join(cwd, 'themes', theme, `${theme}.css`),
    'utf8',
  );
  const m = new RegExp(
    `${token}: light-dark\\((#[0-9a-f]{6}), (#[0-9a-f]{6})\\)`,
  ).exec(css);
  if (!m) throw new Error(`${token} is not a light-dark pair in ${theme}`);
  return [m[1], m[2]].map(c => {
    const [, a, b] = oklabOf(
      /** @type {[number, number, number]} */ (parseColor(c)),
    );
    return Math.hypot(a, b);
  });
};

const ASKS = [
  'neutral grays',
  'make the grays neutral',
  'pure neutral grays, no tint',
];

const T = 300_000;

describe('neutral grays', () => {
  it(
    'grays with no hue already: said so, nothing written, never the hover tint',
    async test => {
      needsBases(test);
      for (const q of ASKS) {
        const results = await answer(q, 'plain');
        expect(results[0].text, q).toMatch(/already neutral/);
        expect(
          results.flatMap(r => r.lines),
          q,
        ).toEqual([]);
        const {data} = await themeEditHow(q, {cwd, theme: 'plain'});
        expect(data.hint, q).toMatch(/is already so in plain/);
        expect(data.hint, q).not.toMatch(/No command does all/);
      }
    },
    T,
  );

  it(
    'a negated ask never makes the grays neutral',
    async test => {
      needsBases(test);
      for (const q of [
        "don't make the grays neutral",
        'never neutral grays',
        "don't use pure neutral grays",
        'avoid using neutral grays',
        'no more neutral grays',
        'remove the neutral grays',
        'get rid of the neutral grays',
        'I hate the neutral grays',
        'neutral grays are too cold, warm them up',
      ]) {
        const results = await answer(q, 'warm');
        expect(
          results.flatMap(r => r.lines),
          q,
        ).toEqual([]);
        expect(
          results.some(r => /grays without a tint/.test(r.text)),
          q,
        ).toBe(false);
      }
      // A hue said after the grays keeps its own reading.
      const blue = await answer('neutral grays with a blue tint', 'warm');
      expect(blue.flatMap(r => r.lines)).not.toContain("neutral '#737373'");
      const [kept] = await answer("don't make the grays neutral", 'warm');
      expect(kept.text).toMatch(/you asked for it not to change/);
      // A negation of another look leaves the grays asked for.
      const [both] = await answer(
        'no rounded corners with neutral grays',
        'warm',
      );
      expect(both.lines).toContain("neutral '#737373'");
    },
    T,
  );

  it(
    'a page color the theme sets itself is named, never a seed that keeps it',
    async test => {
      needsBases(test);
      const results = await answer('neutral grays', 'cream');
      expect(results.flatMap(r => r.lines)).toEqual([]);
      expect(results[0].text).toMatch(
        /--color-background-body, which cream sets itself/,
      );
    },
    T,
  );

  it(
    'a color typed in the clause wins over the plain gray',
    async test => {
      needsBases(test);
      for (const [q, hex] of [
        ['neutral grays: #64748b', '#64748b'],
        ['neutral grays like #64748b', '#64748b'],
        ['neutral grays (#6b7280)', '#6b7280'],
      ])
        for (const theme of ['plain', 'warm']) {
          const [top] = await answer(q, theme);
          expect(top.lines[0], `${theme}: ${q}`).toBe(`neutral '${hex}'`);
        }
    },
    T,
  );

  it(
    'a change comes before the line that says the grays are neutral already, and no internal word shows',
    async test => {
      needsBases(test);
      for (const q of [
        'neutral grays, red buttons',
        'neutral grays and rounder cards',
      ]) {
        const results = await answer(q, 'plain');
        expect(results[0].lines.length, q).toBeGreaterThan(0);
        expect(
          results.some(r => /already neutral/.test(r.text)),
          q,
        ).toBe(true);
      }
      const results = await answer('neutral grays, not warm ones', 'warm');
      expect(results[0].lines).toEqual(["neutral '#737373'"]);
      expect(results.some(r => /untinted/.test(r.text))).toBe(false);
      for (const q of [
        'neutral grays everywhere but buttons',
        'neutral grays on hover',
      ])
        for (const r of await answer(q, 'warm'))
          expect(r.text, q).not.toMatch(/neutral untinted/);
    },
    T,
  );

  it(
    'a change line comes before a lookup line',
    async test => {
      needsBases(test);
      const {data} = await themeEditHow('red buttons, rounder cards', {
        cwd,
        theme: 'plain',
      });
      const changes = /** @type {{commands: string[]}[]} */ (
        data.results ?? []
      ).map(r => r.commands.some(c => / editor (?:set|undo|new) /.test(c)));
      expect(changes.filter(c => !c).length).toBeGreaterThan(0);
      expect(changes.filter(c => c).length).toBeGreaterThan(2);
      expect(changes.indexOf(false)).toBe(changes.lastIndexOf(true) + 1);
    },
    T,
  );

  it(
    'a warm gray: the neutral color as a plain gray, and the grounds lose their tint in both modes',
    async test => {
      needsBases(test);
      for (const q of ASKS) {
        const [top] = await answer(q, 'warm');
        expect(top.lines, q).toEqual(["neutral '#737373'"]);
        expect(top.lines.join(' '), q).not.toMatch(/overlay-hover/);
      }
      expect(
        Math.max(...chromas('warm', '--color-background-surface')),
      ).toBeGreaterThan(0.004);
      await themeEditSet('warm', 'neutral', '#737373', {cwd});
      for (const token of [
        '--color-background-body',
        '--color-background-surface',
        '--color-background-muted',
        '--color-text-secondary',
      ])
        expect(Math.max(...chromas('warm', token)), token).toBeLessThan(0.004);
    },
    T,
  );

  it(
    'a gray with a hue keeps its reading, and the clause keeps its line in a long ask',
    async test => {
      needsBases(test);
      const [cool] = await answer('cool neutral grays', 'plain');
      expect(cool.lines[0]).toBe("neutral '#64748b'");
      const long = await answer(
        'system font, 14px text, medium spacing, flat surfaces, 6px corners, 1px #d0d7de borders, green #1f883d primary buttons, blue #0969da links, neutral grays',
        'plain',
      );
      expect(
        long.some(r => /grays of plain are already neutral/.test(r.text)),
      ).toBe(true);
      expect(long.some(r => /not taken: .*untinted/.test(r.text))).toBe(false);
    },
    T,
  );
});
