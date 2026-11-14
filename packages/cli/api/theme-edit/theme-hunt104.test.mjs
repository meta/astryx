// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The repair gate reads the whole typed value: a line may carry part
 * of it only when the refusal's other lines carry the rest. A decimal
 * comma is a decimal point, a step word authorizes a value only on a dial
 * with a scale, and a saved value only a line of its own setting.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {coversTyped, readsTyped, typedReading} from './_normal.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-hunt104-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('b', {cwd, like: 'neutral'});
}, 240_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** [thing, value, flags, lines that must be offered, a pattern no line matches] */
const CASES =
  /** @type {Array<[string, string, Record<string, string>, RegExp[], RegExp | null]>} */ ([
    // A decimal comma is a decimal point, never a split.
    [
      'font-size',
      '1,5rem',
      {on: 'button'},
      [/ set b font-size 1\.5rem --on button$/],
      / 5rem /,
    ],
    [
      'padding',
      '1,5rem',
      {on: 'card'},
      [/ set b padding 1\.5rem --on card$/],
      / 5rem /,
    ],
    [
      'opacity',
      '0,5',
      {on: 'button'},
      [/ set b opacity 0\.5 --on button$/],
      / opacity 5 /,
    ],
    [
      'transition',
      'all 0,2s ease',
      {on: 'button'},
      [/ set b transition 'all 0\.2s ease' --on button$/],
      / '2s ease'/,
    ],
    // Several values of one kind: the first as typed, no unit added.
    // ...with their sign, read by the one reading the repair and the gate
    // share.
    [
      'margin-top',
      '-4px -8px',
      {on: 'card'},
      [/ set b margin-top -4px --on card$/],
      / how margin-top$/,
    ],
    [
      'line-height',
      '1.5 2',
      {on: 'card'},
      [/ set b line-height 1\.5 --on card$/],
      /1\.5px/,
    ],
    // A shorthand of several kinds: never one of them alone.
    [
      'transition',
      'all 200',
      {on: 'button'},
      [/ how transition$/],
      / transition all /,
    ],
    // A weight word is its number, read as the rung nearest it.
    [
      'headings',
      'extra bold',
      {},
      [/ set b headings heavy$/],
      / headings bold$/,
    ],
    [
      'headings',
      'ultra-bold',
      {},
      [/ set b headings heavy$/],
      / headings bold$/,
    ],
    // A CSS size keyword is the size CSS gives it.
    ['text-size', 'x-large', {}, [/ set b text-size 24$/], / text-size large$/],
    // A step word authorizes a value only on a dial with a scale.
    ['--color-accent', 'more', {}, [/ how --color-accent$/], /#1f2937/],
    ['--font-weight-bold', 'more', {}, [/ how --font-weight-bold$/], / 600$/],
    ['--spacing-2', 'more', {}, [/ how --spacing-2$/], /6px/],
    ['color', 'red less', {on: 'button'}, [/ how color$/], /#1f2937/],
    ['gray', 'more', {}, [/ how gray$/], /#7c3aed/],
    ['brand', 'more', {}, [/ how brand$/], /#7c3aed/],
    // A comma inside a function separates its arguments: never a number
    // mark (the copy debris around it is still read away).
    [
      '--color-accent',
      'rgb(255,0,0);',
      {},
      [/ set b --color-accent 'rgb\(255,0,0\)'$/],
      / how /,
    ],
    [
      'accent',
      'hsl(210,50%,40%) !important',
      {},
      [/ set b accent 'hsl\(210,50%,40%\)'$/],
      / how /,
    ],
    [
      'transition-timing-function',
      'cubic-bezier(0,0,1,1);',
      {on: 'button'},
      [
        / set b transition-timing-function 'cubic-bezier\(0,0,1,1\)' --on button$/,
      ],
      / how /,
    ],
    // A thousands comma on a weight.
    [
      '--font-weight-bold',
      '1,000',
      {},
      [/ set b --font-weight-bold 1000$/],
      /1\.000/,
    ],
    // A part of the value, with the rest on the other lines, is offered.
    [
      'font',
      'Inter 600',
      {},
      [/ set b font Inter$/, / set b headings semibold$/],
      null,
    ],
    [
      'headings',
      'bold tight',
      {},
      [/ set b headings bold$/, / set b headings tight$/],
      null,
    ],
    // A light and dark pair: the light half for a color dial, each half for
    // its mode on a token.
    [
      '--color-accent',
      'light: red; dark: blue',
      {},
      [
        / set b --color-accent 'light-dark\(red, blue\)'$/,
        / --color-accent red --mode light$/,
        / --color-accent blue --mode dark$/,
      ],
      null,
    ],
  ]);

describe('the repair gate offers only lines that carry the whole typed value', () => {
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

  it('a saved value authorizes only a line of its own setting, never the one typed', async () => {
    await themeEditSet('b', 'corners', '60px', {cwd});
    for (const v of ['150', 'banana']) {
      const r = await refusal(() => themeEditSet('b', 'saturation', v, {cwd}));
      expect(r.run.join('\n')).not.toMatch(/ vibrancy 60/);
    }
    const base = await refusal(() => themeEditSet('b', 'base', 'buter', {cwd}));
    expect(base.run.join('\n')).not.toMatch(/ base neutral/);
    const saved = new Map([
      ['corners', ['60px']],
      ['base', ['neutral']],
    ]);
    expect(
      readsTyped({
        offered: '60',
        typed: '150',
        thing: 'vibrancy',
        typedThing: 'saturation',
        saved,
      }),
    ).toBe(false);
    expect(
      readsTyped({
        offered: 'neutral',
        typed: 'buter',
        thing: 'base',
        typedThing: 'base',
        saved,
      }),
    ).toBe(false);
    expect(
      readsTyped({
        offered: '60px',
        typed: 'pill',
        thing: 'corners',
        typedThing: 'accent',
        saved,
      }),
    ).toBe(true);
  }, 240_000);

  it('a light and dark pair on a part in a one-mode theme gives the half it shows', async () => {
    await themeEditNew('lo', {cwd, like: 'neutral'});
    await themeEditSet('lo', 'mode', 'light-only', {cwd});
    const r = await refusal(() =>
      themeEditSet('lo', 'background-color', 'green / yellow', {
        cwd,
        on: 'card',
      }),
    );
    expect(r.run[0]).toMatch(/ set lo background-color green --on card$/);
  }, 240_000);

  it('the line naming a second pasted declaration is one set takes, or none', async () => {
    const r = await themeEditSet('b', '--color-accent', '#7c3aed; color: red', {
      cwd,
    });
    const note = /** @type {any} */ (r.data.notes ?? []).join('\n');
    expect(note).not.toMatch(/ set b color red sets it/);
    const m = await themeEditSet('b', 'padding', '16px; margin: banana', {
      cwd,
      on: 'card',
    });
    expect(/** @type {any} */ (m.data.notes ?? []).join('\n')).not.toMatch(
      /margin banana --on card sets it/,
    );
  }, 240_000);

  it('the gate reads the whole value, a part only when the other lines carry the rest', () => {
    // A keyword with a dash is one word: its typo is corrected; words
    // with a space between are no typo of it.
    expect(
      readsTyped({
        offered: 'not-allowed',
        typed: 'not-alowed',
        thing: 'cursor',
      }),
    ).toBe(true);
    expect(
      readsTyped({offered: 'pointer', typed: 'not pointer', thing: 'cursor'}),
    ).not.toBe(true);
    expect(typedReading('0,5')).toBe('0.5');
    expect(typedReading('rgb(255,0,0)')).toBe('rgb(255,0,0)');
    expect(typedReading('cubic-bezier(0,0,1,1)')).toBe('cubic-bezier(0,0,1,1)');
    expect(typedReading('1,000')).toBe('1000');
    expect(readsTyped({offered: '5', typed: '0,5'})).toBe(false);
    expect(readsTyped({offered: 'bold', typed: 'extra bold'})).toEqual([1]);
    expect(coversTyped([[1]], 'extra bold')).toBe(false);
    expect(readsTyped({offered: 'all', typed: 'all 200'})).toEqual([0]);
    expect(coversTyped([[0]], 'all 200')).toBe(false);
    expect(coversTyped([[0], [1]], 'Inter 600')).toBe(true);
    expect(
      readsTyped({
        offered: '#1f2937',
        typed: 'more',
        thing: '--color-accent',
        typedThing: '--color-accent',
      }),
    ).toBe(false);
    expect(
      readsTyped({
        offered: 'pill',
        typed: 'more',
        thing: 'corners',
        typedThing: 'corners',
      }),
    ).toBe(true);
  });
});
