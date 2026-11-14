// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file One reader for each kind of input, on every path: a family list
 * reads each family from its end (a size, a style, a weight or a number
 * after a name, a misspelled generic or preset); a swapped setting and
 * value, a property written with `_` or spaces, a mode word and a yes/no
 * word are each read one way; a one-entry object is its entry; a saved
 * value set repairs gets that repair; a damaged base or mode is offered the
 * lines that set it again.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {booleanWord, modeWord} from './_normal.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-hunt116-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('b', {cwd, like: 'neutral'});
}, 240_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** [thing, value, flags, lines that must be offered, a pattern no line matches] */
const CASES =
  /** @type {Array<[string, string, Record<string, string>, RegExp[], RegExp | null]>} */ ([
    // A bare number in a list is a weight only as a whole hundred.
    ['font', 'Lato, 16', {}, [/ how font$/], / headings /],
    [
      'font',
      'Lato, 600',
      {},
      [/ set b font Lato$/, / set b headings semibold$/],
      null,
    ],
    // A size after a family's name, on every path.
    [
      'font',
      'Inter 16px',
      {},
      [/ set b font Inter$/, / set b text-size 16$/],
      /"Inter 16px"/,
    ],
    [
      '--font-family-body',
      'Inter 16px',
      {},
      [/ how --font-family-body$/],
      /"Inter 16px"/,
    ],
    [
      'font-family',
      'Inter 16px',
      {on: 'button'},
      [/ how font-family$/],
      /"Inter 16px"/,
    ],
    // A style after a family's name.
    ['font', 'Inter Italic', {}, [/ how font$/], /'Inter Italic'/],
    [
      'font-family',
      'Inter Italic',
      {on: 'button'},
      [
        / set b font-family Inter --on button$/,
        / set b font-style italic --on button$/,
      ],
      null,
    ],
    // A misspelled generic or preset is that name, never a family.
    [
      'font',
      'Inter, sansserif',
      {},
      [/ set b font 'Inter, sans-serif'$/],
      null,
    ],
    ['font', 'Inter, serf', {}, [/ set b font 'Inter, serif'$/], null],
    [
      '--font-family-body',
      'Inter, system ui',
      {},
      [/ set b --font-family-body 'Inter, system-ui'$/],
      null,
    ],
    [
      'font-family',
      'Inter, san-serif',
      {on: 'button'},
      [/ set b font-family 'Inter, sans-serif' --on button$/],
      null,
    ],
    ['font', 'sytem', {}, [/ set b font system$/], /fontsource/],
    // A swapped order is offered only when set takes it as typed.
    ['headngs', 'bold', {}, [], /font-weight bold --on card/],
    ['banana', 'bevel', {}, [], /--on card/],
    // A property written with `_` or spaces reads as camel case does.
    [
      'background_color',
      'red',
      {},
      [/ set b --color-background-body red$/],
      /--on card/,
    ],
    ['border radius', '8px', {}, [/ set b corners 8px$/], /--on card/],
    // A mode word names one mode.
    [
      '--color-accent',
      'red',
      {mode: 'dark-only'},
      [/ set b --color-accent red --mode dark$/],
      / --color-accent red$/,
    ],
    [
      '--color-accent',
      'red',
      {mode: 'dark mode'},
      [/ set b --color-accent red --mode dark$/],
      / --color-accent red$/,
    ],
    // A one-entry object is its entry.
    ['{"headings": "blod"}', '', {}, [/ set b headings bold$/], /how '\{/],
  ]);

describe('one reader for each kind of input', () => {
  it.each(CASES)(
    '%s %s %j',
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

  it('family names the editor knows keep their last word', async () => {
    for (const v of ['Source Serif 4, serif', 'Arial Black, sans-serif'])
      await themeEditSet('b', 'font', v, {cwd});
  }, 120_000);

  it('a saved value set repairs is offered that repair beside the undo', async () => {
    const file = path.join(cwd, 'themes', 'b', 'b.settings.json');
    const before = fs.readFileSync(file, 'utf8');
    try {
      for (const [thing, saved, line] of [
        ['headings', 'blod', / set b headings bold$/],
        ['spacing', 'romy', / set b spacing roomy$/],
        ['text-size', '16px', / set b text-size 16$/],
      ]) {
        const data = JSON.parse(before);
        data.settings = [
          ...(data.settings ?? []),
          {thing, value: saved, source: 'dial'},
        ];
        fs.writeFileSync(file, JSON.stringify(data));
        const r = await refusal(() =>
          themeEditSet('b', '--spacing-4', '12px', {cwd}),
        );
        expect(r.run[0]).toMatch(new RegExp(` undo b ${thing}$`));
        expect(
          r.run.some(x => line.test(x)),
          r.run.join('\n'),
        ).toBe(true);
      }
    } finally {
      fs.writeFileSync(file, before);
    }
  }, 240_000);

  it('a damaged base or mode is offered the lines that set it again', async () => {
    const file = path.join(cwd, 'themes', 'b', 'b.settings.json');
    const before = fs.readFileSync(file, 'utf8');
    try {
      fs.writeFileSync(
        file,
        JSON.stringify({...JSON.parse(before), mode: 'sideways'}),
      );
      const mode = await refusal(() =>
        themeEditSet('b', 'corners', 'pill', {cwd}),
      );
      for (const m of ['both', 'light-only', 'dark-only'])
        expect(mode.run).toContainEqual(
          expect.stringMatching(new RegExp(` set b mode ${m}$`)),
        );
      fs.writeFileSync(file, JSON.stringify({...JSON.parse(before), like: ''}));
      const base = await refusal(() =>
        themeEditSet('b', 'corners', 'pill', {cwd}),
      );
      expect(base.run).toContainEqual(
        expect.stringMatching(/ set b base neutral$/),
      );
      expect(base.run.join('\n')).not.toMatch(/ set b base none$/);
      // A base written with `theme` is the base, read as meant.
      fs.writeFileSync(
        file,
        JSON.stringify({...JSON.parse(before), like: 'neutral-theme'}),
      );
      await themeEditSet('b', 'corners', 'pill', {cwd});
      expect(JSON.parse(fs.readFileSync(file, 'utf8')).like).toBe('neutral');
    } finally {
      fs.writeFileSync(file, before);
    }
  }, 240_000);

  it('reads yes/no and mode words one way', () => {
    for (const w of ['true', 'yes', 'y', 'on', '1', 'ture'])
      expect(booleanWord(w), w).toBe(true);
    for (const w of ['false', 'no', 'n', 'off', '0', 'flase'])
      expect(booleanWord(w), w).toBe(false);
    for (const w of ['maybe', 'banana', ''])
      expect(booleanWord(w), w).toBe(null);
    for (const w of [
      'dark',
      'dark-only',
      'darkmode',
      'dark mode',
      'mode dark',
      'night',
    ])
      expect(modeWord(w), w).toBe('dark');
    for (const w of ['light-only', 'Light Mode', 'day'])
      expect(modeWord(w), w).toBe('light');
    expect(modeWord('both')).toBe(null);
  });
});
