// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The input reader over more shapes: several parts named in one --on,
 * a flag's label after the value or a flag inside it, background layers
 * with one too many or an empty one, numbers given as font families, words
 * on part properties, and negations. A line offered names what was typed,
 * never a group of other parts, a reset or a guessed unit.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditUndo} from './theme-edit.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt92-', FIXTURE_PACKAGES);
  await themeEditNew('b', {cwd});
}, 240_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** [thing, value, flags, lines that must be offered, a pattern no line matches] */
const CASES =
  /** @type {Array<[string, string, Record<string, string>, RegExp[], RegExp | null]>} */ ([
    [
      'padding',
      '8px',
      {on: 'button, text-input'},
      [
        / set b padding 8px --on button$/,
        / set b padding 8px --on text-input$/,
      ],
      /--on inputs/,
    ],
    [
      'padding',
      '8px',
      {on: 'button,text-input'},
      [/ --on button$/, / --on text-input$/],
      /--on inputs/,
    ],
    [
      'padding',
      '8px',
      {on: 'button/text-input'},
      [/ --on button$/, / --on text-input$/],
      /--on inputs/,
    ],
    [
      'padding',
      '8px',
      {on: 'button and text-input'},
      [/ --on button$/, / --on text-input$/],
      /--on inputs/,
    ],
    [
      'padding',
      '8px',
      {on: 'button text-input'},
      [/ --on button$/, / --on text-input$/],
      /--on inputs/,
    ],
    [
      'padding',
      '8px',
      {on: 'card, dialog'},
      [/ --on card$/, / --on dialog$/],
      null,
    ],
    // Words that name one part stay that part.
    [
      'padding',
      '8px',
      {on: 'text inputs'},
      [/ set b padding 8px --on text-input$/],
      /--on inputs/,
    ],
    ['padding', '8px', {on: 'dialog header'}, [/ --on dialog-header$/], null],
    // A flag's label after the value.
    [
      'background',
      'red mode: dark',
      {on: 'button'},
      [/ set b background red --on button --mode dark$/],
      /red-mode/,
    ],
    [
      'background',
      'red state: hover',
      {on: 'button'},
      [/ set b background red --on button --state hover$/],
      /red-state/,
    ],
    [
      'background',
      'red variant: primary',
      {on: 'button'},
      [/ set b background red --on button --when variant:primary$/],
      null,
    ],
    [
      'background',
      'red part: card',
      {on: 'button'},
      [/ set b background red --on card$/],
      null,
    ],
    // Layers with one too many or an empty one: the layers typed, never none.
    [
      'background',
      'url(a.png), red, blue',
      {on: 'button'},
      // A layer left out is part of the value: how, never a subset.
      [/ how background$/],
      / background none|url\(a\.png\), red'/,
    ],
    [
      'background',
      'red,,blue',
      {on: 'button'},
      [/ how background$/],
      / background none|background (red|blue) /,
    ],
    // A reset typed with a typo is that reset, corrected.
    // A typo within the one limit: two letters swapped are one edit; a
    // keyword two edits away is no typo of a four-letter word.
    [
      'display',
      'flxe',
      {on: 'card'},
      [/ set b display flex --on card$/],
      / display flow/,
    ],
    // A typo of a keyword that starts with no- or not- is read as a typo;
    // a real negation is still never given the word it negates.
    [
      'cursor',
      'not-alowed',
      {on: 'button'},
      [/ set b cursor not-allowed --on button$/],
      null,
    ],
    [
      'background-repeat',
      'no-repat',
      {on: 'card'},
      [/ set b background-repeat no-repeat --on card$/],
      null,
    ],
    [
      'cursor',
      'not pointer',
      {on: 'button'},
      [/ how cursor$/],
      / cursor (pointer|not-allowed) /,
    ],
    // A short word two edits from a reset is no typo of it.
    [
      'border-style',
      'line',
      {on: 'card'},
      [/ how border-style$/],
      / border-style none/,
    ],
    [
      'display',
      'nnone',
      {on: 'card'},
      [/ set b display none --on card$/],
      null,
    ],
    [
      'box-shadow',
      'nnone',
      {on: 'card'},
      [/ set b box-shadow none --on card$/],
      null,
    ],
    [
      'text-transform',
      'nnone',
      {on: 'button'},
      [/ set b text-transform none --on button$/],
      null,
    ],
    [
      'font-weight',
      'normall',
      {on: 'button'},
      [/ set b font-weight normal --on button$/],
      null,
    ],
    // A bare number on a shorthand where a length is only a position.
    ['background', '0.5', {on: 'card'}, [/ how background$/], /0\.5px/],
    ['background', '2', {on: 'card'}, [/ how background$/], /2px/],
    // A number or size is no font family.
    ['--font-family-body', '700', {}, [/ how --font-family-body$/], /"700"/],
    [
      '--font-family-heading',
      '16px',
      {},
      [/ how --font-family-heading$/],
      /"16px"/,
    ],
    ['font-family', '700', {on: 'card'}, [/ how font-family$/], /"700"/],
    // A negation never gets the word it negates.
    ['corners', 'not round', {}, [/ set b corners square$/], / corners round$/],
    [
      'corners',
      'rounded-none',
      {},
      [/ set b corners square$/],
      / corners round$/,
    ],
    ['corners', 'unrounded', {}, [/ set b corners square$/], / corners round$/],
    ['corners', 'rounded-full', {}, [/ set b corners pill$/], null],
    ['corners', 'rounded-[12px]', {}, [/ set b corners 12px$/], null],
    ['headings', 'not bold', {}, [/ how headings$/], / headings bold$/],
    ['buttons', 'no caps', {}, [/ how buttons$/], / buttons caps$/],
    ['accent', 'not red', {}, [/ how accent$/], / accent red$/],
    ['accent', 'anything but blue', {}, [/ how accent$/], / accent blue$/],
    // A flag typed inside the value is lifted out.
    [
      'accent',
      'red --mode dark',
      {},
      [/ set b --color-accent red --mode dark$/],
      / set b accent red$/,
    ],
    [
      'padding',
      '4px --state hover',
      {on: 'button'},
      [/ set b padding 4px --on button --state hover$/],
      / padding 4px --on button$/,
    ],
    [
      'corners',
      'pill --on button',
      {},
      [/ set b corners pill --on button$/],
      / corners pill$/,
    ],
    // Words with a documented reading on a part property.
    [
      'content',
      'Hi',
      {on: 'badge'},
      [/ set b content '"Hi"' --on badge$/],
      / content normal/,
    ],
    [
      'font-weight',
      'heavy',
      {on: 'button'},
      [/ set b font-weight 800 --on button$/],
      / font-weight normal/,
    ],
    [
      'text-transform',
      'caps',
      {on: 'button'},
      [/ set b text-transform uppercase --on button$/],
      / text-transform none/,
    ],
    [
      'border-radius',
      'round',
      {on: 'card'},
      [/ set b border-radius 9999px --on card$/],
      null,
    ],
    ['opacity', 'half', {on: 'card'}, [/ set b opacity 0\.5 --on card$/], null],
  ]);

/** Words on part properties: a line never sets the property's reset. */
const RESETS = / (0|0px|none|1|auto|normal|initial|unset)( --|$)/;
const WORDS = [
  'large',
  'bigger',
  'sm',
  'soft',
  'wide',
  'half',
  'round',
  '2 spacing units',
  '2 steps',
];
const PROPS = [
  'padding',
  'margin',
  'gap',
  'border-radius',
  'box-shadow',
  'letter-spacing',
  'opacity',
  'border-width',
  'line-height',
];
const CORPUS = PROPS.flatMap(p =>
  WORDS.map(w => /** @type {[string, string]} */ ([p, w])),
);

describe('repairs offer only what was typed', () => {
  it.each(CASES)(
    '%s %s %j offers what was typed',
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

  it.each(CORPUS)(
    '%s %s offers no reset it was not given',
    async (prop, word) => {
      /** @type {any} */
      let r;
      try {
        await themeEditSet('b', prop, word, {cwd, on: 'card'});
        return;
      } catch (e) {
        r = e;
      }
      for (const x of (r.suggestions ?? []).map(
        (/** @type {any} */ y) => y.name,
      ))
        if (x.includes(` set b ${prop} `)) expect(x).not.toMatch(RESETS);
    },
    120_000,
  );

  it('an undo naming several parts offers one undo per part', async () => {
    await themeEditSet('b', 'padding', '8px', {cwd, on: 'button'});
    const r = await refusal(() =>
      themeEditUndo('b', {cwd, thing: 'padding', on: 'button, text-input'}),
    );
    expect(r.message).not.toMatch(/the part is inputs/);
    expect(r.run.some(x => / undo b padding --on button$/.test(x))).toBe(true);
  }, 120_000);
});
