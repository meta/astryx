// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how` through its shared readers: fills as background
 * colors, one keep reader in any position, decimal commas, an amount held
 * to its bound, removals over a part list, swaps done exactly, a part and
 * an aspect alone writing nothing, one mode grammar, constraints honored or
 * refused, named dial rungs, typed colors over color words, and values
 * read from whole declarations.
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
  cwd = makeLinkedFixture('astryx-theme-hunt117-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral', 'butter']);
  if (unbuilt) return;
  await themeEditNew('n', {cwd, like: 'neutral'});
  await themeEditNew('b', {cwd, like: 'butter'});
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
      results.find(r => r.commands.some(c => / editor set /.test(c)))
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

const T = 120_000;

describe('wrong writes that are no longer accepted', () => {
  it(
    'a fill is the background color, so Core keeps its hover tint',
    async test => {
      needsBases(test);
      expect(
        (await answer('primary buttons should be #ff0000', 'b')).first,
      ).toEqual([
        "set b background-color '#ff0000' --on button --when variant:primary",
      ]);
    },
    T,
  );
  it(
    'never pure white moves only what is pure white, never to white',
    async test => {
      needsBases(test);
      const {first} = await answer('never use pure white for backgrounds');
      expect(first.length).toBeGreaterThan(0);
      expect(first.some(c => /#ffffff/i.test(c))).toBe(false);
      const page = await answer(
        'never use pure white for the page background',
        'b',
      );
      expect(page.first).toEqual([]);
      expect(page.text).toMatch(/is #ffffff in any mode, so nothing changes/);
    },
    T,
  );
  it(
    'a one-mode dialog shadow moves only that mode',
    async test => {
      needsBases(test);
      const {first} = await answer('make dialog shadows darker in light mode');
      expect(first).toHaveLength(1);
      // The dark halves stay neutral's own.
      expect(first[0]).toMatch(/oklch\(0 0 0 \/ 50%\)\)/);
      expect(
        (await answer('make dialog shadows darker in dark mode', 'b')).first,
      ).toEqual([
        "set b box-shadow '0 4px 6px light-dark(#1d1c111a, #1d1c1127), 0 12px 24px light-dark(#1d1c1126, #1d1c1139)' --on dialog",
      ]);
    },
    T,
  );
  it(
    'a button group cannot be kept apart from the buttons in it',
    async test => {
      needsBases(test);
      const r = await answer(
        'make buttons rounder but keep button groups as they are',
      );
      expect(r.first).toEqual([]);
      expect(r.text).toMatch(/cannot be kept apart/);
    },
    T,
  );
  it(
    'a decimal comma is a decimal',
    async test => {
      needsBases(test);
      expect((await answer('card padding 1,5 times more')).first).toEqual([
        'set n padding 1.125rem --on card',
      ]);
      expect((await answer('make headings 1,5 times bigger')).text).toMatch(
        /x1\.5/,
      );
    },
    T,
  );
  it.each(
    /** @type {Array<[string, string, string[]]>} */ ([
      [
        'make card padding 8px more but at most 20px',
        'b',
        ['set b padding 20px --on card'],
      ],
      ['make card padding 4px less but at least 12px', 'n', []],
      [
        'make card corners 8px rounder but no more than 16px',
        'n',
        ['set n border-radius 16px --on card'],
      ],
      [
        "don't make the buttons rounder than 8px",
        'n',
        ['set n border-radius 8px --on button'],
      ],
    ]),
  )(
    'an amount is held to its bound: %s',
    async (q, theme, want, test) => {
      needsBases(/** @type {any} */ (test));
      expect((await answer(q, theme)).first).toEqual(want);
    },
    T,
  );
  it(
    'a removal of the X and Y of cards stays on the cards',
    async test => {
      needsBases(test);
      expect(
        (await answer('remove the shadows and borders of cards')).first,
      ).toEqual([
        'set n box-shadow none --on card',
        'set n border none --on card',
      ]);
    },
    T,
  );
  it(
    'a swap is exact or nothing',
    async test => {
      needsBases(test);
      expect((await answer('swap the card and button corners')).first).toEqual([
        "set n border-radius 'var(--radius-container)' --on button",
        "set n border-radius 'var(--radius-element)' --on card",
      ]);
      const same = await answer('swap the card and dialog corners');
      expect(same.first).toEqual([]);
      expect(same.text).toMatch(/already show the same/);
    },
    T,
  );
  it.each(['card corners', 'card shadow', 'card padding', 'button corners'])(
    'a part and an aspect alone write nothing: %s',
    async (q, test) => {
      needsBases(/** @type {any} */ (test));
      expect((await answer(q)).first).toEqual([]);
    },
    T,
  );
  it(
    '"at night" is dark mode',
    async test => {
      needsBases(test);
      const r = await answer('at night, cards should be #1c1c1e', 'lo');
      expect(r.first).toEqual([]);
      expect(r.text).toMatch(/has only a light mode/);
    },
    T,
  );
  it(
    'a second keep joins the except list, in any position',
    async test => {
      needsBases(test);
      const {first} = await answer(
        'make everything rounder except buttons, but keep cards as they are',
      );
      expect(first.some(c => /--on button$/.test(c))).toBe(true);
      expect(first.some(c => /--on card$/.test(c))).toBe(true);
      const lead = await answer(
        'keep the dialogs as they are and make all corners square',
      );
      expect(lead.first[0]).toBe('set n corners square');
      expect(lead.first.some(c => /--on dialog$/.test(c))).toBe(true);
    },
    T,
  );
  it(
    '"not the primary ones" leaves the primary variant out',
    async test => {
      needsBases(test);
      const {first} = await answer('make buttons darker, not the primary ones');
      expect(first.length).toBeGreaterThan(0);
      expect(first.some(c => /variant:primary --mode/.test(c))).toBe(false);
    },
    T,
  );
  it(
    'a border removed except when focused keeps the focused border whole',
    async test => {
      needsBases(test);
      const {first} = await answer(
        'remove the border from inputs except when focused',
      );
      expect(first).toContain(
        "set n border '1px solid var(--color-accent)' --on inputs --state focus-within",
      );
    },
    T,
  );
  it(
    'readable text pairs a label that reads on the fill in each mode',
    async test => {
      needsBases(test);
      const {first} = await answer(
        'make the primary buttons #7c3aed with readable text',
      );
      expect(first).toEqual([
        "set n background-color '#7c3aed' --on button --when variant:primary",
        "set n color 'var(--color-on-dark)' --on button --when variant:primary --mode dark",
      ]);
    },
    T,
  );
  it(
    'less colorful is refused when the accent wash would get more saturated',
    async test => {
      needsBases(test);
      const r = await answer('make it less colorful', 'b');
      expect(r.text).not.toMatch(/is a gray/);
    },
    T,
  );
});

describe('an app with no editor theme', () => {
  it(
    'starts from and measures against the theme the app shows now',
    async test => {
      needsBases(test);
      const app = makeLinkedFixture(
        'astryx-theme-hunt117-app-',
        FIXTURE_PACKAGES,
      );
      try {
        const missing = await installRealBaseThemes(app, ['butter']);
        if (missing) return;
        // The app module `theme add butter` writes: its record names the
        // app's default theme.
        fs.mkdirSync(path.join(app, 'src'), {recursive: true});
        fs.writeFileSync(
          path.join(app, 'src/astryx-themes.js'),
          [
            '/**',
            ' * @generated by `astryx theme` — do not edit manually.',
            ' * @astryx-theme-record {"themes":{"butter":"@astryxdesign/theme-butter"},"defaultThemeSlug":"butter"}',
            ' */',
            '',
            'import {butterTheme as _astryxTheme0} from "@astryxdesign/theme-butter/built";',
            '',
            'export const themes = {',
            '  "butter": _astryxTheme0,',
            '};',
            '',
            'export const defaultThemeSlug = "butter";',
            '',
          ].join('\n'),
        );
        const {data} = await themeEditHow(
          'make the sidebar a little darker than the page',
          {cwd: app},
        );
        expect(String(data.themeNote)).toMatch(/--like butter/);
        const step = (data.results ?? [])
          .flatMap(r => r.commands)
          .find(c => /--on side-nav --mode light/.test(c));
        // A shade of butter's own page, never neutral's.
        expect(step).toMatch(/'#eeecd6'/);
      } finally {
        removeLinkedFixture(app);
      }
    },
    T,
  );
});

describe('asks it used to drop', () => {
  it(
    'a one-mode dialog shadow on butter is answered',
    async test => {
      needsBases(test);
      expect(
        (await answer('make the dialog shadow stronger in light mode', 'b'))
          .first,
      ).toHaveLength(1);
    },
    T,
  );
  it(
    'the success color for badges pairs its label',
    async test => {
      needsBases(test);
      const {first} = await answer(
        'make badges the same color as the success color',
      );
      expect(first).toContain(
        "set n background-color 'var(--color-success)' --on badge",
      );
      expect(first).toContain(
        "set n color 'var(--color-on-success)' --on badge",
      );
    },
    T,
  );
  it.each(
    /** @type {Array<[string, string]>} */ ([
      ['make corners small', 'set n corners small'],
      ['make the card corners small', 'set n corners small --on card'],
      ['make spacing compact', 'set n spacing compact'],
      ['make text size large', 'set n text-size large'],
      ['make surfaces glass', 'set n surfaces glass'],
    ]),
  )(
    'a named rung is that rung: %s',
    async (q, want, test) => {
      needsBases(/** @type {any} */ (test));
      expect((await answer(q)).first).toEqual([want]);
    },
    T,
  );
  it(
    'a typed shadow color is the shadow color',
    async test => {
      needsBases(test);
      expect((await answer('card shadow #0000001a 0 4px 8px')).first).toEqual([
        "set n box-shadow '0 4px 8px #0000001a' --on card",
      ]);
      expect((await answer('make the card shadow #ff000080')).first[0]).toMatch(
        /#ff000080.*#ff000080/,
      );
    },
    T,
  );
  it(
    'a typed text color wins over the accent it sits on',
    async test => {
      needsBases(test);
      expect(
        (await answer('make text on the accent color white')).first,
      ).toEqual(["set n --color-on-accent '#ffffff'"]);
      expect(
        (await answer('make labels on the accent color white')).first,
      ).toEqual(["set n color '#ffffff' --on field-label"]);
    },
    T,
  );
  it(
    'a lighter hue is that hue’s light shade',
    async test => {
      needsBases(test);
      expect(
        (await answer('make primary buttons a lighter purple')).first,
      ).toEqual([
        "set n background-color '#ede9fe' --on button --when variant:primary",
      ]);
    },
    T,
  );
  it(
    'an amount less round than another part',
    async test => {
      needsBases(test);
      expect(
        (await answer('make cards 4px less round than buttons')).first,
      ).toEqual([
        "set n border-radius 'calc(var(--radius-element) - 4px)' --on card",
      ]);
    },
    T,
  );
  it(
    'a padding Core writes from two tokens is measured whole',
    async test => {
      needsBases(test);
      expect(
        (await answer('make the card padding smaller than 8px')).first,
      ).toEqual(['set n padding 6px --on card']);
    },
    T,
  );
  it(
    'a comma list of parts ending in "or" names each one',
    async test => {
      needsBases(test);
      expect(
        (await answer('no border on cards, buttons or inputs')).first,
      ).toEqual([
        'set n border none --on card',
        'set n border none --on button',
        'set n border none --on inputs',
      ]);
    },
    T,
  );
});
