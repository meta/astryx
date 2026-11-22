// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A bare neutral-grays clause ("neutral grays", "use neutral grays",
 * "neutral greys"), on a theme that sets no part colors, reads as grays
 * with no hue of their own. On a theme whose grays already have none, how
 * says so and writes nothing; on a tinted one (a warm gray), it gives the
 * neutral color as Neutral's mid gray, and the page, surfaces and
 * secondary text lose their tint in every mode. Every other ask keeps
 * main's answer.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import {oklabOf, parseColor} from './_color.mjs';
import {valueHasTint} from './_how-question.mjs';
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
  unbuilt = await installRealBaseThemes(cwd, ['neutral', 'stone']);
  if (!unbuilt) {
    await themeEditNew('plain', {cwd, like: 'neutral'});
    await themeEditNew('warm', {cwd, like: 'neutral'});
    await themeEditSet('warm', 'neutral', '#78716c', {cwd});
    await themeEditNew('rgbedge', {cwd, like: 'neutral'});
    await themeEditSet('rgbedge', 'border', '1px solid rgb(120 113 108)', {
      cwd,
      on: 'card',
    });
    await themeEditNew('cream', {cwd, like: 'neutral'});
    await themeEditSet('cream', '--color-background-body', '#faf3e8', {cwd});
    await themeEditNew('creamy', {cwd, like: 'neutral'});
    await themeEditSet('creamy', 'background-color', '#fef3c7', {
      cwd,
      on: 'card',
      when: 'variant:default',
      mode: 'light',
    });
    await themeEditNew('stony', {cwd, like: 'stone'});
    await themeEditSet('stony', 'neutral', '#777777', {cwd});
    await themeEditNew('night', {cwd, like: 'neutral'});
    await themeEditSet('night', 'mode', 'dark-only', {cwd});
    await themeEditSet('night', 'neutral', '#78716c', {cwd});
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

const ASKS = ['neutral grays', 'use neutral grays', 'neutral greys'];

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
    'a theme that sets a part color inside a shorthand keeps the base answer',
    async test => {
      needsBases(test);
      const results = await answer('neutral grays', 'rgbedge');
      expect(results.flatMap(r => r.lines)).toEqual([]);
      expect(
        results.some(r => /already neutral|grays without a tint/.test(r.text)),
      ).toBe(false);
    },
    T,
  );

  it(
    'an "untinted" said for something else is still named as not taken',
    async test => {
      needsBases(test);
      for (const q of [
        'untinted cards, 12px corners, bold headings, untinted grays',
        'red buttons, rounder cards, 6px corners! untinted grays',
      ]) {
        const results = await answer(q, 'plain');
        expect(
          results.some(r => /not taken: .*untinted/.test(r.text)),
          q,
        ).toBe(true);
      }
    },
    T,
  );

  it(
    'a closing mark after the grays in a longer ask still reads them',
    async test => {
      needsBases(test);
      const q = 'red buttons, rounder cards, untinted grays!';
      const results = await answer(q, 'warm');
      expect(results.flatMap(r => r.lines)).toContain("neutral '#777777'");
      expect(results.some(r => /not taken: .*untinted/.test(r.text))).toBe(
        false,
      );
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
        'avoid: neutral grays',
        'never use: neutral grays',
        'avoid the following: neutral grays',
        'avoid these: neutral grays',
        'not this: neutral grays',
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
      // (A removal or a dislike before "and" turns the whole list away: the
      // grays are never made plain.)
      for (const q of [
        'I hate rounded corners and neutral grays',
        'remove rounded corners and neutral grays',
        'get rid of rounded corners and neutral grays',
        'ditch rounded corners and neutral grays',
        'skip rounded corners and neutral grays',
        'I dislike rounded corners and neutral grays',
        // (Grays said before another clause keep the base answer.)
        'neutral grays, drop shadows on cards',
        'neutral grays, system font, 14px text, green #1f883d primary buttons, blue #0969da links',
        // (A prohibition anywhere keeps the base answer.)
        "buttons shouldn't be round, neutral grays",
        "don't make buttons rounder, neutral grays",
        "neutral grays, don't make buttons rounder",
        "Don't make buttons rounder, neutral grays",
        'neutral grays, never hide the tab underline',
        // (Typographic apostrophes read the same.)
        'I don\u2019t like rounded corners and neutral grays',
        'neutral grays, don\u2019t make buttons rounder',
        'buttons shouldn\u2019t be round, neutral grays',
        // (A removal before the grays turns them away even when they carry
        // a verb of their own.)
        'remove rounded corners and use neutral grays',
        'I hate rounded corners and want neutral grays',
      ]) {
        const results = await answer(q, 'warm');
        expect(
          results.flatMap(r => r.lines),
          q,
        ).not.toContain("neutral '#777777'");
        expect(
          results.some(r => /grays without a tint/.test(r.text)),
          q,
        ).toBe(false);
      }
      // (A removal word in another clause, or "drop shadows" as a thing,
      // turns nothing away: the grays are read.)
      for (const q of [
        'zero radius corners, neutral grays',
        'remove the card borders, neutral grays',
        'cards with drop shadows and neutral grays',
        'cards with drop-shadows and neutral grays',
        'zero radius corners and neutral grays',
      ]) {
        const results = await answer(q, 'warm');
        expect(
          results.flatMap(r => r.lines),
          q,
        ).toContain("neutral '#777777'");
      }
      // A hue in the "with", "but" or comma clause after the grays keeps
      // the clause's own reading: no plain gray, and no "pick one".
      for (const q of [
        'neutral grays with a hint of blue',
        'neutral grays but slightly warm',
        'neutral grays, but warmer',
      ]) {
        const warm = await answer(q, 'warm');
        expect(
          warm.flatMap(r => r.lines),
          q,
        ).not.toContain("neutral '#777777'");
        expect(
          warm.some(r => /contradict/.test(r.text)),
          q,
        ).toBe(false);
      }
      // A turned-away lead before a colon reaches the grays in its list.
      const avoid = await answer(
        'things to avoid: neutral grays, rounded corners',
        'warm',
      );
      expect(avoid.flatMap(r => r.lines)).not.toContain("neutral '#777777'");
      // A hue or a lightness said of the grays keeps its own reading.
      for (const q of [
        'neutral grays with a blue tint',
        'darker neutral grays',
        'lighter neutral grays',
        'cool-toned neutral grays',
        'warm-toned neutral grays',
        'greige neutral grays',
      ]) {
        const warm = await answer(q, 'warm');
        expect(
          warm.flatMap(r => r.lines),
          q,
        ).not.toContain("neutral '#777777'");
        const plain = await answer(q, 'plain');
        expect(
          plain.some(r => /already neutral/.test(r.text)),
          q,
        ).toBe(false);
      }
      const [kept] = await answer("don't make the grays neutral", 'warm');
      expect(kept.text).toMatch(/you asked for it not to change/);
    },
    T,
  );

  it(
    "keeps main's reading for every ask but a bare neutral-grays clause on a theme that sets no part colors",
    async test => {
      needsBases(test);
      // (Main's answers for these asks: the start of each result's text
      // and its commands.)
      const MAIN =
        /** @type {Array<[string, string, Array<[string, string[]]>]>} */ (
          JSON.parse(
            fs.readFileSync(
              new URL(
                './__tests__/neutral-grays-base-answers.json',
                import.meta.url,
              ),
              'utf8',
            ),
          )
        );
      for (const [q, theme, want] of MAIN) {
        const {data} = await themeEditHow(q, {cwd, theme});
        expect(
          /** @type {{text: string, commands: string[]}[]} */ (
            data.results ?? []
          ).map(r => [
            r.text.slice(0, 60),
            r.commands.map(c => c.replace(/^.*editor /, '')),
          ]),
          `${theme}: ${q}`,
        ).toEqual(want);
      }
    },
    T,
  );

  it(
    'a one-mode theme is never told both modes change',
    async test => {
      needsBases(test);
      const [top] = await answer('neutral grays', 'night');
      expect(top.lines).toEqual(["neutral '#777777'"]);
      expect(top.text).toMatch(/in its one mode/);
      expect(top.text).not.toMatch(/both modes/);
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
        ['#6b7280 neutral grays', '#6b7280'],
        ['use #6b7280 for the neutral grays', '#6b7280'],
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
        'red buttons, neutral grays',
        'rounder cards and neutral grays',
      ]) {
        const results = await answer(q, 'plain');
        expect(results[0].lines.length, q).toBeGreaterThan(0);
        expect(
          results.some(r => /already neutral/.test(r.text)),
          q,
        ).toBe(true);
      }
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
        expect(top.lines, q).toEqual(["neutral '#777777'"]);
        expect(top.lines.join(' '), q).not.toMatch(/overlay-hover/);
      }
      expect(
        Math.max(...chromas('warm', '--color-background-surface')),
      ).toBeGreaterThan(0.004);
      await themeEditSet('warm', 'neutral', '#777777', {cwd});
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
    'a gray with a hue keeps its reading, and a long ask never shows the internal word',
    async test => {
      needsBases(test);
      const [cool] = await answer('cool neutral grays', 'plain');
      expect(cool.lines[0]).toBe("neutral '#64748b'");
      const long = await answer(
        'system font, 14px text, medium spacing, flat surfaces, 6px corners, 1px #d0d7de borders, green #1f883d primary buttons, blue #0969da links, neutral grays',
        'plain',
      );
      expect(long.some(r => /not taken: .*untinted/.test(r.text))).toBe(false);
    },
    T,
  );
  it('reads a tint in every color syntax a part rule may use', () => {
    // (A value's hex and color-function colors are read, lch(), lab(),
    // hwb() and color() included, in a shorthand too.)
    for (const v of [
      'lch(52 6 80)',
      '1px solid lch(52 6 80)',
      'color(srgb 0.6 0.55 0.5)',
      '1px solid color(srgb 0.6 0.55 0.5)',
      'lab(52 4 8)',
      '#78716c',
    ])
      expect(valueHasTint(v), v).toBe(true);
    for (const v of ['lch(52 0 0)', 'color(srgb 0.5 0.5 0.5)', '#777777'])
      expect(valueHasTint(v), v).toBe(false);
  });

  it(
    'in a long ask on a tinted theme the plain gray runs with the whole-theme asks, and the readable-text line stays under the cut',
    async test => {
      needsBases(test);
      // (A warm theme of its own: an earlier test makes "warm" plain.)
      await themeEditNew('toasty', {cwd, like: 'neutral'});
      await themeEditSet('toasty', 'neutral', '#78716c', {cwd});
      const results = await answer(
        'system font, 14px text, medium spacing, flat surfaces, 6px corners, 1px #d0d7de borders, green #1f883d primary buttons, blue #0969da links, neutral grays',
        'toasty',
      );
      expect(results[0].lines).toContain("neutral '#777777'");
      expect(results[0].text).toMatch(/^the first 6 of /);
      expect(results.filter(r => /^then, after/.test(r.text)).length).toBe(1);
      // (The fill's own line, not a sequence line that also holds it.)
      const fill = results.findIndex(
        r =>
          r.lines.length === 1 &&
          r.lines[0] === "background-color '#1f883d' --on button",
      );
      expect(fill).toBeGreaterThan(-1);
      expect(results[fill + 1]?.text).toMatch(/^readable text on that fill/);
    },
    T,
  );
});
