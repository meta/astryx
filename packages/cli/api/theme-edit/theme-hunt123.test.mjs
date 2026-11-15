// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how` with mode words read as modes, see-through colors kept
 * see-through, a part's shadow and border per mode in the mode's block (a
 * card's ring kept), corners stepped from what a part shows, role words that
 * scope, keeps without "as they are", one except list, and swaps and
 * removals done in every mode they name.
 *
 * @position api/theme-edit — tests
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

/** @type {string} */
let cwd;
/** Why a bundled base could not be installed here, when one could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt123-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral', 'butter', 'stone']);
  if (unbuilt) return;
  await themeEditNew('n', {cwd, like: 'neutral'});
  await themeEditNew('b', {cwd, like: 'butter'});
  await themeEditNew('s', {cwd, like: 'stone'});
  await themeEditNew('lo', {cwd, like: 'butter'});
  await themeEditSet('lo', 'mode', 'light-only', {cwd});
}, 600_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** @param {string} q @param {string} [theme] */
const answer = async (q, theme = 'n') => {
  const {data} = await themeEditHow(q, {cwd, theme});
  const results = data.results ?? [];
  return {
    first: (
      results.find(r => r.commands.some(c => / editor (set|undo) /.test(c)))
        ?.commands ?? []
    ).map(c => c.replace(/^.* editor /, '')),
    text: results.map(r => r.text).join('\n'),
  };
};

/** @param {import('vitest').TestContext} test */
const needsBases = test => {
  if (unbuilt) {
    console.warn(`skipped: ${unbuilt}`);
    test.skip();
  }
};

/** @param {string} theme */
const css = theme =>
  fs.readFileSync(path.join(cwd, `themes/${theme}/${theme}.css`), 'utf8');

const T = 120_000;

describe('wrong writes that are no longer accepted', () => {
  it(
    'a one-mode card shadow keeps the ring and the other mode',
    async test => {
      needsBases(test);
      // set takes --mode only for colors: the mode lives in the colors.
      expect(
        (await answer('card shadow 0 4px 12px #00000080 in light mode', 'b'))
          .first,
      ).toEqual([
        "set b box-shadow '0 4px 12px light-dark(#00000080, transparent)' --on card",
      ]);
      await themeEditSet(
        'b',
        'box-shadow',
        '0 4px 12px light-dark(#00000080, transparent)',
        {cwd, on: 'card'},
      );
      // Core's ring and elevation layers stay in the card's shadow.
      expect(css('b')).toMatch(
        /\.astryx-card[^{]*\{[^}]*box-shadow: var\(--_card-ring,[^;]*0 4px 12px light-dark\(#00000080, transparent\);/,
      );
    },
    T,
  );
  it(
    'a see-through role color stays see-through',
    async test => {
      needsBases(test);
      expect(
        (await answer('make the neutral color lighter in dark mode')).first,
      ).toEqual(["set n --color-neutral '#ffffff27' --mode dark"]);
    },
    T,
  );
  it(
    '"darker in light mode" is darker',
    async test => {
      needsBases(test);
      expect(
        (await answer('make the danger color darker in light mode')).first,
      ).toEqual(["set n --color-error '#a1262e' --mode light"]);
    },
    T,
  );
  it(
    'the accent text is the accent text token, never the main text',
    async test => {
      needsBases(test);
      const {first} = await answer(
        'make the accent text darker in dark mode',
        'b',
      );
      expect(first).toHaveLength(1);
      expect(first[0]).toMatch(
        /^set b --color-text-accent '#[0-9a-f]{6}' --mode dark$/,
      );
    },
    T,
  );
  it(
    'a px corner step starts from what the part shows and passes set',
    async test => {
      needsBases(test);
      expect((await answer('make every button 4px rounder')).first).toEqual([
        'set n border-radius 14px --on button',
      ]);
      const pill = await answer('make buttons 4px rounder', 's');
      expect(pill.first).toEqual([]);
      expect(pill.text).toMatch(/fully round now/);
    },
    T,
  );
  it(
    'a gradient of one named color uses that color',
    async test => {
      needsBases(test);
      expect((await answer('make cards a red gradient')).first[0]).toBe(
        "set n background 'linear-gradient(#dc2626, #e87272)' --on card",
      );
    },
    T,
  );
  it(
    '"but keep the inputs" keeps the inputs',
    async test => {
      needsBases(test);
      const r = await answer(
        'remove borders from cards and buttons but keep the inputs',
      );
      expect(r.text).not.toMatch(/--on inputs/);
      expect(r.first.some(c => /--on inputs/.test(c))).toBe(false);
    },
    T,
  );
  it(
    'labels on accent buttons are the accent-filled variant’s',
    async test => {
      needsBases(test);
      expect(
        (await answer('make labels on accent buttons white')).first,
      ).toEqual(["set n color '#ffffff' --on button --when variant:primary"]);
    },
    T,
  );
  it(
    'a mode word scoping another ask never changes the theme’s modes',
    async test => {
      needsBases(test);
      const r = await answer('make it more colorful in dark mode', 'lo');
      expect(r.first.some(c => /\bmode both\b/.test(c))).toBe(false);
      expect((await answer('add dark mode', 'lo')).first).toEqual([
        'set lo mode both',
      ]);
    },
    T,
  );
  it(
    'headings bigger never grows the body text',
    async test => {
      needsBases(test);
      const {data} = await themeEditHow('make headings bigger', {
        cwd,
        theme: 'n',
      });
      expect(
        (data.results ?? [])
          .flatMap(r => r.commands)
          .some(c => /text-size/.test(c)),
      ).toBe(false);
    },
    T,
  );
  it(
    'darker than the page keeps each card variant apart',
    async test => {
      needsBases(test);
      const {first} = await answer(
        'make cards darker than the page in dark mode',
      );
      const values = new Set(first.map(c => /'(#[0-9a-f]+)'/.exec(c)?.[1]));
      expect(values.size).toBeGreaterThan(2);
      expect(first.every(c => /--when variant:/.test(c))).toBe(true);
    },
    T,
  );
  it(
    'a removal the theme already has is never undone',
    async test => {
      needsBases(test);
      await themeEditSet('n', 'box-shadow', 'none', {cwd, on: 'dialog'});
      const r = await answer('remove the shadow from dialogs');
      expect(r.first.some(c => /^undo /.test(c))).toBe(false);
    },
    T,
  );
  it(
    '"as dark as the page" is the page’s color',
    async test => {
      needsBases(test);
      expect(
        (await answer('make dialogs as dark as the page in dark mode', 'b'))
          .first,
      ).toEqual([
        "set b background-color 'var(--color-background-body)' --on dialog --mode dark",
      ]);
    },
    T,
  );
  it(
    'a swap swaps each mode',
    async test => {
      needsBases(test);
      expect(
        (await answer('swap the accent and danger colors', 'b')).first,
      ).toEqual([
        "set b accent '#821b00'",
        "set b danger '#225bff'",
        "set b --color-accent '#ffc5b5' --mode dark",
        "set b --color-error '#fdee8c' --mode dark",
      ]);
    },
    T,
  );
});

describe('asks it used to drop', () => {
  it(
    'a one-mode removal goes into that mode',
    async test => {
      needsBases(test);
      expect((await answer('remove card borders in dark mode')).first[0]).toBe(
        'set n border-color transparent --on card --mode dark',
      );
      const shadows = await answer('no shadows in dark mode');
      expect(shadows.first).toHaveLength(3);
      expect(shadows.first[0]).toMatch(/^set n --shadow-low '.*transparent\)/);
    },
    T,
  );
  it(
    'a one-mode border direction reads that mode’s page',
    async test => {
      needsBases(test);
      expect((await answer('make borders lighter in dark mode')).first).toEqual(
        ["set n --color-border '#ffffff27' --mode dark"],
      );
    },
    T,
  );
  it(
    'headings by a px amount move each level',
    async test => {
      needsBases(test);
      const {first} = await answer('make headings 2px bigger');
      expect(first).toHaveLength(6);
      expect(first[0]).toBe('set n --text-heading-1-size 26px');
    },
    T,
  );
  it(
    'a one-mode swap of roles',
    async test => {
      needsBases(test);
      expect(
        (await answer('swap the accent and danger colors in dark mode', 'b'))
          .first,
      ).toEqual([
        "set b --color-accent '#ffc5b5' --mode dark",
        "set b --color-error '#fdee8c' --mode dark",
      ]);
    },
    T,
  );
  it(
    'an except list keeps every item it names',
    async test => {
      needsBases(test);
      const {first} = await answer(
        'make buttons rounder except primary and ghost buttons',
      );
      expect(first).toContain(
        'set n border-radius 0.625rem --on button --when variant:primary',
      );
      expect(first).toContain(
        'set n border-radius 0.625rem --on button --when variant:ghost',
      );
    },
    T,
  );
  it(
    'a typed one-mode dialog shadow color stays in that mode',
    async test => {
      needsBases(test);
      // Each layer the dialog shows stays in light mode; the new ones show
      // in dark mode only.
      const [line] = (await answer('dialog shadow #00000080 in dark mode', 'b'))
        .first;
      expect(line).toMatch(/light-dark\(#1d1c111a, transparent\)/);
      expect(line).toMatch(/light-dark\(transparent, #00000080\)/);
      expect(line).toMatch(/--on dialog$/);
    },
    T,
  );
});
