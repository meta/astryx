// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The input reader over more pasted shapes: labels on part
 * properties and type tokens, objects in loose forms, saved pairs and
 * vibrancy, whole quoted font stacks, density and dial words, calc() units
 * per operation, a mode word on a color dial, escapes, font labels, family
 * separators, size tokens and short hex colors. A line offered carries the
 * value typed or a documented reading of it, never a stock value.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-hunt84-', FIXTURE_PACKAGES);
  await themeEditNew('b', {cwd});
}, 240_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/**
 * Refused inputs and what the lines offered must (and must not) hold.
 * [thing, value, flags, first line matches, no line matches]
 */
const REFUSED =
  /** @type {Array<[string, string, Record<string, any>, RegExp | null, RegExp | null]>} */ ([
    // A state, mode, part or own label on a part property.
    [
      'padding',
      'hover: 4px',
      {on: 'button'},
      / set b padding 4px --on button --state hover$/,
      / set b padding 4px --on button$/,
    ],
    [
      'background-color',
      'hover: red',
      {on: 'button'},
      / set b background-color red --on button --state hover$/,
      null,
    ],
    [
      'background-color',
      'dark: red',
      {on: 'button'},
      / set b background-color red --on button --mode dark$/,
      null,
    ],
    [
      'border-radius',
      'card: 4px',
      {on: 'button'},
      / set b border-radius 4px --on card$/,
      / --on button$/,
    ],
    [
      'color',
      'accent: red',
      {on: 'button'},
      / set b accent red/,
      / set b color red/,
    ],
    // A mode label on a type token.
    [
      '--font-weight-bold',
      'dark: 700',
      {},
      / set b --font-weight-bold 700$/,
      null,
    ],
    [
      '--font-family-body',
      'dark: Georgia',
      {},
      / set b --font-family-body Georgia$/,
      null,
    ],
    // Objects in loose forms.
    [
      "{'accent'",
      "'#e11d48','corners':'pill'}",
      {},
      / set b accent '#e11d48'$/,
      /7c3aed/,
    ],
    [
      '"accent"',
      '"#e11d48", "corners": "pill"',
      {},
      / set b accent '#e11d48'$/,
      /7c3aed/,
    ],
    // Density and dial words: the direction typed, or how.
    ['density', 'roomy', {}, / set b spacing roomy$/, /compact/],
    ['density', 'airy', {}, / set b spacing roomy$/, /compact/],
    ['corners', 'banana', {}, / how corners$/, /corners medium/],
    ['spacing', 'qqqq', {}, / how spacing$/, /spacing roomy/],
    // A calc() whose units do not combine.
    [
      '--radius-element',
      'calc(var(--a, 8) + 2px * var(--b, 1))',
      {},
      null,
      null,
    ],
    ['--radius-element', 'calc(0.5rem * var(--r, 1px))', {}, null, null],
    ['--radius-element', 'calc(var(--a, 1px) * var(--b, 1px))', {}, null, null],
    ['--radius-element', 'calc(8 + 2px)', {}, null, null],
    // A night or day mode on a color dial keeps the one mode.
    [
      'accent',
      'red',
      {mode: 'night'},
      / set b --color-accent red --mode dark$/,
      / set b accent red$/,
    ],
    [
      'accent',
      'red',
      {mode: 'day'},
      / set b --color-accent red --mode light$/,
      / set b accent red$/,
    ],
    // Another setting's label on the font: that setting, never a font.
    ['font', 'accent: red', {}, / set b accent red$/, / set b font red/],
    ['font', 'corners: pill', {}, / set b corners pill$/, / set b font pill/],
    // A size token with nothing readable: how, never its default.
    ['--radius-element', 'banana', {}, / how /, /8px/],
    ['--spacing-4', 'banana', {}, / how /, /1rem/],
    ['--radius-element', 'accent: red', {}, / set b accent red$/, /8px/],
    ['--color-accent', 'text-size: 18', {}, / set b text-size 18$/, null],
    // A whole stack in one pair of quotes, families split by other marks or
    // a comma missing: the list meant.
    [
      '--font-family-body',
      '"Inter, serif"',
      {},
      / set b --font-family-body 'Inter, serif'$/,
      /sans-serif/,
    ],
    [
      '--font-family-body',
      "'Inter, serif'",
      {},
      / set b --font-family-body 'Inter, serif'$/,
      /sans-serif/,
    ],
    [
      '--font-family-body',
      '「Inter, serif」',
      {},
      / set b --font-family-body 'Inter, serif'$/,
      /sans-serif/,
    ],
    ['font', '"Georgia, serif"', {}, / set b font 'Georgia, serif'$/, null],
    [
      'font',
      'Inter, Georgia serif',
      {},
      / set b font 'Inter, Georgia, serif'$/,
      null,
    ],
    [
      'font',
      'Inter, sans-serif monospace',
      {},
      / set b font 'Inter, sans-serif, monospace'$/,
      null,
    ],
    [
      'font',
      'Inter | sans-serif',
      {},
      / set b font 'Inter, sans-serif'$/,
      null,
    ],
    [
      'font',
      'Inter;sans-serif',
      {},
      / set b font 'Inter, sans-serif'$/,
      / font inter$/,
    ],
    ['font', 'georgia serif', {}, / set b font 'georgia, serif'$/, null],
    // A flag's own name as the label: what that flag does, never a part.
    ['accent', 'state: hover', {}, /how 'hover accent'/, null],
    ['corners', 'part: card', {}, /how 'card corners'/, null],
    ['accent', 'variant: primary', {}, /how 'primary accent'/, null],
    ['corners', 'mode: dark', {}, / set b mode dark-only$/, null],
    // A two-word color name, or a hex written as in code.
    ['accent', 'navy blue', {}, / set b accent navy$/, / accent blue$/],
    ['accent', '0xe11d48', {}, / set b accent '#e11d48'$/, null],
    // A hex color one digit short: never a digit made up.
    ['accent', '#e11d4', {}, null, /#e11d44/],
    ['accent', '#abcd1', {}, null, /#abcd11/],
  ]);

/** Accepted inputs and what is saved. [thing, value, flags, saved] */
const ACCEPTED =
  /** @type {Array<[string, string, Record<string, any>, RegExp]>} */ ([
    ['background-color', 'background-color: red', {on: 'button'}, /^red$/],
    ['font', 'font: Inter, serif', {}, /^Inter, serif$/],
    ['font', 'Font: Georgia', {}, /georgia/i],
    ['--font-family-body', 'fontFamily: Inter, serif', {}, /^Inter, serif$/],
    ['font', '"Inter\\u0020Tight"', {}, /Inter Tight/],
    ['content', '"\\x2022"', {on: 'badge'}, /\\2022/],
    ['--radius-element', 'calc(var(--a, 8px) + 2px * var(--b, 1))', {}, /calc/],
    ['accent', '{"color":"#e11d48"}', {}, /^#e11d48$/],
  ]);

describe('hunt84', () => {
  it.each(REFUSED)(
    'refuses %s %s %j with a line that carries it',
    async (thing, value, flags, first, never) => {
      const r = await refusal(() =>
        themeEditSet('b', thing, value, {cwd, ...flags}),
      );
      if (first)
        expect(
          r.run.some(l => first.test(l)),
          r.run.join('\n'),
        ).toBe(true);
      if (never) for (const line of r.run) expect(line).not.toMatch(never);
    },
    120_000,
  );

  it.each(ACCEPTED)(
    'accepts %s %s %j as the value meant',
    async (thing, value, flags, saved) => {
      const done = await themeEditSet('b', thing, value, {cwd, ...flags});
      expect(
        String(/** @type {any} */ (done.data).setting?.value ?? ''),
      ).toMatch(saved);
    },
    120_000,
  );

  it('a saved light and dark pair or a vibrancy with no color offers only lines that work', async () => {
    await themeEditNew('sv', {cwd});
    const file = path.join(cwd, 'themes/sv/sv.settings.json');
    const write = (/** @type {any} */ entry) => {
      const j = JSON.parse(fs.readFileSync(file, 'utf8'));
      j.settings = [entry];
      fs.writeFileSync(file, JSON.stringify(j, null, 2));
      fs.rmSync(path.join(cwd, 'themes/sv/sv.history.json'), {force: true});
    };
    write({thing: '--color-accent', value: 'red / blue', source: 'token'});
    const pair = await refusal(() => themeEditShow('sv', {cwd}));
    expect(pair.run.join('\n')).not.toMatch(/#1f2937/);
    expect(pair.run.join('\n')).toMatch(/light-dark\(red, blue\)/);
    write({thing: 'vibrancy', value: '0.5', source: 'dial'});
    const vib = await refusal(() => themeEditShow('sv', {cwd}));
    expect(vib.run.join('\n')).not.toMatch(/ set sv vibrancy/);
    expect(vib.run[0]).toMatch(/ undo sv vibrancy$/);
  }, 240_000);
  it("a value pasted with a token's label is read as a label, not an option", async () => {
    const ran = await runCli(
      [
        '--json',
        'experimental',
        'theme',
        'editor',
        'set',
        'b',
        'accent',
        '--color-accent: #e11d48',
      ],
      {cwd},
    );
    expect(ran.stdout + ran.stderr).not.toMatch(/unknown option/);
    expect(ran.stdout).toMatch(/set b --color-accent '#e11d48'/);
  }, 120_000);
});
