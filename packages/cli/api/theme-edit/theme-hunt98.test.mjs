// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A repair offers a value only through the one gate's declared
 * sources: the value typed under exact transformations (quotes, labels and
 * copy debris off, a unit worked out, CSS color names written as words), a
 * documented table (a Tailwind radius class, a dial's words, a numeric
 * rung), the theme's own saved values, the setting's documented fallback
 * or other-direction step, and the correction of a typo. Anything else is
 * `how <thing>`. Each offered line passes set's own check.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {allowedLine} from './_normal.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt98-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('b', {cwd, like: 'neutral'});
}, 240_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** [thing, value, flags, lines that must be offered, a pattern no line matches] */
const CASES =
  /** @type {Array<[string, string, Record<string, string>, RegExp[], RegExp | null]>} */ ([
    // Tailwind radius classes are their sizes.
    ['corners', 'rounded-lg', {}, [/ set b corners 8px$/], / corners round$/],
    ['corners', 'rounded-md', {}, [/ set b corners 6px$/], / corners round$/],
    ['corners', 'rounded-sm', {}, [/ set b corners 2px$/], / corners round$/],
    ['corners', 'rounded', {}, [/ set b corners 4px$/], / corners round$/],
    ['corners', 'rounded-full', {}, [/ set b corners pill$/], null],
    // A label or spec that is no setting word: how, or the family.
    ['accent', 'tw:red-500', {}, [/ how accent$/], /\btab\b/],
    ['font', 'Inter:wght@400;600', {}, [/ set b font Inter$/], /\bcenter\b/],
    // A weight after a family.
    [
      'font',
      'Inter 600',
      {},
      [/ set b font Inter$/, / set b headings semibold$/],
      null,
    ],
    [
      'font',
      'Inter bold italic',
      {},
      // italic has no theme-wide setting: the lines would leave it out, so
      // none is offered.
      [/ how font$/],
      / set b font Inter$/,
    ],
    // Stock examples are never offered.
    [
      '--shadow-low',
      'light-dark(0 1px 2px #000, 0 2px 4px #fff)',
      {},
      [/ how --shadow-low$/],
      /rgb\(0 0 0 \/ 0\.2\)/,
    ],
    [
      '--ease-standard',
      'ease-in-outt',
      {},
      [/ how --ease-standard$/],
      /cubic-bezier/,
    ],
    [
      'spacing',
      'roomy',
      {on: 'avatar-status-dot-glyph'},
      [/ how /],
      /padding 8px/,
    ],
    // Color names written as words are that color; a scale step is not.
    ['accent', 'dark red', {}, [/ set b accent darkred$/], / accent red$/],
    ['accent', 'light-blue', {}, [/ set b accent lightblue$/], / accent blue$/],
    [
      'accent',
      'dark-slate-gray',
      {},
      [/ set b accent darkslategray$/],
      / accent gray$/,
    ],
    ['accent', 'red-500', {}, [/ how accent$/], / accent red$/],
    ['accent', 'gray-900', {}, [/ how accent$/], / accent gray$/],
    ['accent', 'bg-red-500', {}, [/ how accent$/], / accent red$/],
    // Another property's label on a part property is that property's.
    [
      'padding',
      'margin: 8px',
      {on: 'card'},
      [/ set b margin 8px --on card$/],
      / set b padding 8px/,
    ],
    // The editor's own color words for an unknown token.
    [
      '--color-danger',
      'red',
      {},
      [/ set b --color-error red$/],
      /--color-border/,
    ],
    ['--color-primary', 'red', {}, [/ set b --color-accent red$/], null],
    [
      '--color-brand',
      'red',
      {},
      [/ set b --color-accent red$/, / how --list tokens$/],
      /--list tokens brand/,
    ],
    // A flag inside the value: lifted, the rest cleaned, the line checked.
    [
      'background',
      'red !important --on card',
      {},
      [/ set b background red --on card$/],
      /important/,
    ],
    [
      'background',
      '#fff; --on card',
      {},
      [/ set b background '#fff' --on card$/],
      /;'/,
    ],
    [
      'background',
      'red /* x */ --on card',
      {},
      [/ set b background red --on card$/],
      /\/\*/,
    ],
    ['background', 'banana --on card', {}, [/ how background$/], /banana --on/],
    // A dial's other name never gets a stock violet.
    ['brand', 'banana', {}, [/ how /], /7c3aed/],
    ['error', 'rgb(1,2)', {}, [/ how /], /7c3aed/],
    ['saturation', '70', {}, [/ how /], null],
    // A CSS property typed for the whole theme: its dial or token.
    ['border-radius', '8px', {}, [/ set b corners 8px$/], /--on card/],
    [
      'color',
      '#111827',
      {},
      [/ set b --color-text-primary '#111827'$/],
      /--on card/,
    ],
    ['fill', 'red', {}, [/ how fill$/], /--on card/],
    // A bare fraction on a radius token gets no unit guessed.
    ['--radius-element', '0.5', {}, [/ how --radius-element$/], /0\.5px/],
    // A long input is near nothing, even when it holds a setting's word
    // (a pasted blob that names square somewhere is no typo of it).
    ['corners', 'x'.repeat(3100), {}, [/ how corners$/], / corners square$/],
    [
      'corners',
      `square ${'x'.repeat(70)}`,
      {},
      [/ how corners$/],
      / corners square$/,
    ],
    // A CSS-wide keyword on a token the theme does not set: how, no undo.
    [
      '--color-accent',
      'inherit',
      {},
      [/ how --color-accent$/],
      / undo b --color-accent$|1f2937/,
    ],
    // A trailing `;` is copy debris: the value without it.
    ['padding', '8px;', {on: 'card'}, [/ set b padding 8px --on card$/], null],
    [
      'background',
      '#fff;',
      {on: 'card'},
      [/ set b background '#fff' --on card$/],
      null,
    ],
    ['corners', '8px;', {}, [/ set b corners 8px$/], null],
    // Several states: one line each.
    [
      'padding',
      '4px',
      {on: 'button', state: 'hover,focus-visible'},
      [/ --state hover$/, / --state focus-visible$/],
      /hover-focus-visible/,
    ],
    [
      'padding',
      '4px',
      {on: 'button', state: 'hover focus-visible'},
      [/ --state hover$/, / --state focus-visible$/],
      /hover-focus-visible/,
    ],
  ]);

describe('a refusal offers only values read from what was typed', () => {
  it.each(CASES)(
    '%s %s %j offers only exact readings',
    async (thing, value, flags, lines, never) => {
      const r = await refusal(() =>
        themeEditSet('b', thing, value, {cwd, ...flags}),
      );
      for (const line of lines)
        expect(
          r.run.some(x => line.test(x)),
          `${line}\n${r.run.join('\n')}`,
        ).toBe(true);
      if (never) for (const x of r.run) expect(x).not.toMatch(never);
    },
    120_000,
  );

  it('a weight word that is part of a family name is kept; a weight number never is', async () => {
    // The whole name is a family the editor knows, or the name without the
    // word is none: the word is part of the name.
    for (const family of [
      'Arial Black',
      'Archivo Black',
      'Segoe UI Semibold',
    ]) {
      const r = await themeEditSet('b', 'font', family, {cwd});
      expect(JSON.stringify(r.data), family).toContain(family);
    }
    // The name without the word is a known family and the whole is not:
    // the word is a weight.
    const word = await refusal(() =>
      themeEditSet('b', 'font', 'Inter ExtraBold', {cwd}),
    );
    expect(word.run).toContainEqual(
      expect.stringMatching(/ set b font Inter$/),
    );
    const number = await refusal(() =>
      themeEditSet('b', 'font', 'Inter 600', {cwd}),
    );
    expect(number.run).toContainEqual(
      expect.stringMatching(/ set b headings semibold$/),
    );
  }, 240_000);

  it('a saved light and dark pair for one mode is refused, with the half for that mode', async () => {
    await themeEditNew('sp', {cwd, like: 'neutral'});
    const file = path.join(cwd, 'themes/sp/sp.settings.json');
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    j.settings.push({
      thing: '--color-accent',
      value: 'light-dark(#f00, #0f0)',
      source: 'token',
      mode: 'dark',
    });
    fs.writeFileSync(file, JSON.stringify(j, null, 2));
    fs.rmSync(path.join(cwd, 'themes/sp/sp.history.json'), {force: true});
    const r = await refusal(() => themeEditShow('sp', {cwd}));
    expect(r.run).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/ undo sp --color-accent --mode dark$/),
        expect.stringMatching(/ set sp --color-accent '#0f0' --mode dark$/),
      ]),
    );
  }, 120_000);

  /** Junk and near-miss values over dials, tokens and part properties. */
  const THINGS = /** @type {Array<[string, Record<string, string>]>} */ ([
    ['accent', {}],
    ['corners', {}],
    ['spacing', {}],
    ['font', {}],
    ['--radius-element', {}],
    ['--color-accent', {}],
    ['--shadow-low', {}],
    ['--ease-standard', {}],
    ['padding', {on: 'card'}],
    ['background', {on: 'card'}],
    ['box-shadow', {on: 'card'}],
    ['color', {on: 'button'}],
  ]);
  const VALUES = [
    'banana',
    'not round',
    'rounded-lg',
    'red-500',
    'medium-ish',
    'qqq',
    'very soft',
    'brandish',
    '#12',
    'big 2',
  ];
  const CORPUS = THINGS.flatMap(([t, f]) =>
    VALUES.map(
      v => /** @type {[string, string, Record<string, string>]} */ ([t, v, f]),
    ),
  );

  it.each(CORPUS)(
    '%s %s %j: every value offered is in the input or the allowlist',
    async (thing, value, flags) => {
      /** @type {any} */
      let err;
      try {
        await themeEditSet('b', thing, value, {cwd, ...flags});
        return;
      } catch (e) {
        err = e;
      }
      const head = / set b (?:'([^']+)'|(\S+)) (?:'((?:[^']|'\\'')*)'|(\S+))/;
      for (const s of err.suggestions ?? []) {
        const m = head.exec(s.name);
        if (!m) continue;
        const offered = m[3] ?? m[4];
        expect(
          allowedLine({offered, typed: value, thing: m[1] ?? m[2]}),
          `${s.name} for ${value}`,
        ).toBe(true);
      }
      // A refusal names a command that works.
      expect(
        (err.suggestions ?? []).some(
          (/** @type {any} */ s) =>
            / (set|undo|new|how|show) /.test(` ${s.name} `) &&
            !/--help$/.test(s.name),
        ),
      ).toBe(true);
    },
    120_000,
  );
});
