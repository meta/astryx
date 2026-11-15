// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The input reader reads numbers, labels and font lists one way on
 * every path: a comma is a thousands mark only on a weight, two numbers are
 * never joined, a minus sign is never read away, another property's
 * declaration is never a setting's value, and a family list holds families.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {commaNumbers, readsTyped, typedReading} from './_normal.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-hunt113-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('b', {cwd, like: 'neutral'});
}, 240_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** [thing, value, flags, lines that must be offered, a pattern no line or message matches] */
const CASES =
  /** @type {Array<[string, string, Record<string, string>, RegExp[], RegExp | null]>} */ ([
    // A comma is a decimal point on a length, a time or a line height.
    [
      'font-size',
      '1,125rem',
      {on: 'button'},
      [/ set b font-size 1\.125rem --on button$/],
      /1125rem/,
    ],
    [
      'line-height',
      '1,125',
      {on: 'card'},
      [/ set b line-height 1\.125 --on card$/],
      / 1125 /,
    ],
    [
      'transition-duration',
      '1,250s',
      {on: 'button'},
      [/ transition-duration 1\.250?s --on button$/],
      /1250s/,
    ],
    // ...and a thousands mark on a weight.
    [
      '--font-weight-bold',
      '1,000',
      {},
      [/ set b --font-weight-bold 1000$/],
      null,
    ],
    // Two numbers are never joined into one.
    ['--spacing-2', '12 16px', {}, [/ how --spacing-2$/], /1216px/],
    ['--spacing-2', '8 8px', {}, [/ how --spacing-2$/], /88px/],
    ['text-size', '1 6', {}, [/ how text-size$/], / text-size 16$/],
    // Another property's declaration is no setting's value.
    ['corners', 'margin: 24px', {}, [], / corners 24px/],
    ['text-size', 'width: 20px', {}, [], / text-size 20$/],
    ['headings', 'line-height: 700', {}, [], / headings bold$/],
    ['--font-weight-bold', 'z-index: 700', {}, [], / --font-weight-bold 700$/],
    // A family list holds families: a weight or a size in it, alone or
    // after a family, and a quoted generic are read out of it.
    [
      'font',
      'Inter, 600',
      {},
      [/ set b font Inter$/, / set b headings semibold$/],
      null,
    ],
    ['font', 'Georgia, 18px', {}, [/ set b font Georgia$/], null],
    [
      'font',
      'Inter 600, sans-serif',
      {},
      [/ set b font 'Inter, sans-serif'$/, / set b headings semibold$/],
      /fontsource/,
    ],
    [
      'font',
      'Inter extra-bold',
      {},
      [/ set b font Inter$/, / headings heavy$/],
      /fontsource/,
    ],
    ['font', 'Inter 1000', {}, [/ set b font Inter$/], /fontsource/],
    [
      '--font-family-body',
      "'Inter', 'sans-serif'",
      {},
      [/ set b --font-family-body 'Inter, sans-serif'$/],
      null,
    ],
    [
      'font-family',
      'Open Sans serif',
      {on: 'button'},
      [/ set b font-family 'Open Sans, serif' --on button$/],
      null,
    ],
    // Values a grammar pairs with a slash take the pair, never the first.
    [
      'aspect-ratio',
      '16 9',
      {on: 'card'},
      [/ set b aspect-ratio '16 \/ 9' --on card$/],
      / aspect-ratio 16 --on/,
    ],
    [
      'grid-row',
      '2 4',
      {on: 'card'},
      [/ set b grid-row '2 \/ 4' --on card$/],
      / grid-row 2 --on/,
    ],
    // A mode label in any spelling is that mode.
    [
      '--color-accent',
      'dark mode: red',
      {},
      [/ set b --color-accent red --mode dark$/],
      / --color-accent red$/,
    ],
    [
      '--color-accent',
      'darkmode: red',
      {},
      [/ set b --color-accent red --mode dark$/],
      / --color-accent red$/,
    ],
    [
      '--color-accent',
      'mode dark: red',
      {},
      [/ set b --color-accent red --mode dark$/],
      / --color-accent red$/,
    ],
    // A minus sign is never read away.
    ['--spacing-2', '-8px', {}, [/ how --spacing-2$/], / --spacing-2 8px$/],
    ['padding', '-8px', {on: 'card'}, [/ how padding$/], / padding 8px /],
    [
      'transition-duration',
      '-200ms',
      {on: 'button'},
      [/ how transition-duration$/],
      / 200ms /,
    ],
    [
      '--font-weight-bold',
      '-700',
      {},
      [/ how --font-weight-bold$/],
      / --font-weight-bold 1$/,
    ],
  ]);

describe('the input reader reads numbers, labels and font lists one way', () => {
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
      if (never) {
        for (const x of r.run) expect(x).not.toMatch(never);
        expect(r.message).not.toMatch(never);
      }
    },
    120_000,
  );

  it('a weight word that is part of a family name is kept in a list, on every path', async () => {
    for (const list of [
      'Arial Black, sans-serif',
      'Archivo Black, serif',
      'Segoe UI Semibold, sans-serif',
    ]) {
      await themeEditSet('b', 'font', list, {cwd});
      await themeEditSet('b', '--font-family-heading', list, {cwd});
      await themeEditSet('b', 'font-family', list, {cwd, on: 'button'});
    }
    // A weight number in a list is never part of a name.
    const r = await refusal(() =>
      themeEditSet('b', 'font', 'Arial Black 900, sans-serif', {cwd}),
    );
    expect(r.run).toContainEqual(
      expect.stringMatching(/ set b font 'Arial Black, sans-serif'$/),
    );
  }, 240_000);

  it('a pasted object whose entries all fail points to how for each entry', async () => {
    const r = await refusal(() =>
      themeEditSet('b', '{"accent": "rde", "corners": "sqr"}', undefined, {
        cwd,
      }),
    );
    expect(r.run).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/ how accent$/),
        expect.stringMatching(/ how corners$/),
      ]),
    );
    expect(r.run.join('\n')).not.toMatch(/ how settings/);
  }, 120_000);

  it('a base or mode one slip off is read as meant, and one that reads as nothing is refused, never dropped', async () => {
    const file = path.join(cwd, 'themes', 'b', 'b.settings.json');
    const before = fs.readFileSync(file, 'utf8');
    try {
      for (const [field, typed, meant] of [
        ['like', 'neutrl', 'neutral'],
        ['mode', 'light', 'light-only'],
        ['mode', 'lightonly', 'light-only'],
      ]) {
        fs.writeFileSync(
          file,
          JSON.stringify({...JSON.parse(before), [field]: typed}),
        );
        await themeEditSet('b', 'corners', 'pill', {cwd});
        expect(JSON.parse(fs.readFileSync(file, 'utf8'))[field]).toBe(meant);
      }
      for (const [field, typed, line] of [
        // The line sets it again to the base the theme was built on.
        ['like', 'zzzz', / set b base neutral$/],
        ['mode', 'sideways', / set b mode both$/],
      ]) {
        const damaged = JSON.stringify({
          ...JSON.parse(before),
          [field]: typed,
        });
        fs.writeFileSync(file, damaged);
        const r = await refusal(() =>
          themeEditSet('b', 'corners', 'square', {cwd}),
        );
        expect(
          r.run.some(x => line.test(x)),
          r.run.join('\n'),
        ).toBe(true);
        expect(fs.readFileSync(file, 'utf8')).toBe(damaged);
      }
    } finally {
      fs.writeFileSync(file, before);
    }
  }, 240_000);

  it('the gate reads a comma by the setting, keeps signs and never joins numbers', () => {
    expect(commaNumbers('1,125rem')).toBe('1.125rem');
    expect(commaNumbers('1,000', true)).toBe('1000');
    expect(typedReading('1,000')).toBe('1.000');
    expect(typedReading('1,000', {thousands: true})).toBe('1000');
    expect(
      readsTyped({offered: '1125rem', typed: '1,125rem', thing: 'font-size'}),
    ).toBe(false);
    expect(
      readsTyped({
        offered: '1000',
        typed: '1,000',
        thing: '--font-weight-bold',
      }),
    ).toBe(true);
    expect(
      readsTyped({offered: '1216px', typed: '12 16px', thing: '--spacing-2'}),
    ).toBe(false);
    expect(
      readsTyped({offered: 'darkred', typed: 'dark red', thing: 'accent'}),
    ).toBe(true);
    expect(
      readsTyped({offered: '8px', typed: '-8px', thing: '--spacing-2'}),
    ).toBe(false);
    expect(
      readsTyped({offered: '1', typed: '-700', thing: '--font-weight-bold'}),
    ).toBe(false);
    expect(
      readsTyped({
        offered: 'red',
        typed: 'dark mode: red',
        thing: '--color-accent',
        mode: 'dark',
      }),
    ).toBe(true);
  });
});
