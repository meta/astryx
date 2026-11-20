// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how`: on a theme that draws
 * both modes, a clearly light page or surface color goes to light mode and
 * a clearly dark one to dark mode, said, unless the ask says both modes; a
 * fill on a part that holds others names a part inside at nearly the same
 * color; a prohibition on a part's text never writes the forbidden color;
 * a later clause about everything or the theme text takes no part from
 * the clause before; a size word before what changes is the amount, never
 * the part's size; a value the question gives leads over show's missed
 * list.
 *
 * @position api/theme-edit — tests
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditHow, themeEditNew} from './theme-edit.mjs';
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
  cwd = makeLinkedFixture(
    'astryx-theme-how-draws-modes-clearly-light-',
    FIXTURE_PACKAGES,
  );
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) return;
  await themeEditNew('n', {cwd, like: 'neutral'});
}, 600_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** @param {string} q */
const answer = async q => {
  const {data} = await themeEditHow(q, {cwd, theme: 'n'});
  const results = data.results ?? [];
  const sets = (/** @type {string[]} */ cs) =>
    cs
      .filter(c => / editor set /.test(c))
      .map(c => c.replace(/^.* editor set \S+ /, ''));
  return {
    first: sets(
      results.find(r => r.commands.some(c => / editor set /.test(c)))
        ?.commands ?? [],
    ),
    all: sets(results.flatMap(r => r.commands)),
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

const T = 300_000;

describe('a page or surface color, by mode', () => {
  it(
    'goes to the mode it suits, said; whole when the ask says both modes',
    async test => {
      needsBases(test);
      const cream = await answer('cream background');
      expect(cream.first.slice(0, 1)).toEqual([
        "--color-background-body '#fef3c7' --mode light",
      ]);
      expect(cream.text).toMatch(/dark mode keeps its own page/);
      expect((await answer('page bg #F2F2F7')).first.slice(0, 1)).toEqual([
        "--color-background-body '#f2f2f7' --mode light",
      ]);
      expect(
        (await answer('make the background #1e293b')).first.slice(0, 1),
      ).toEqual(["--color-background-body '#1e293b' --mode dark"]);
      expect(
        (await answer('make the page #fffbeb in both modes')).first.slice(0, 1),
      ).toEqual(["--color-background-body '#fffbeb'"]);
      expect((await answer('white cards')).first).toEqual([
        "background-color '#ffffff' --on card --when variant:default --mode light",
        "background-color '#ffffff' --on card --when variant:transparent --mode light",
        "background-color '#ffffff' --on card --when variant:muted --mode light",
      ]);
      // (An inverted surface, a tooltip, is dark in light mode by design.)
      for (const c of (await answer('make tooltips black')).first)
        expect(c).not.toMatch(/--mode dark/);
    },
    T,
  );
});

describe('clone and blind asks', () => {
  it(
    'a part inside a filled holder at nearly the same color is named',
    async test => {
      needsBases(test);
      expect((await answer('make the header black')).text).toMatch(
        /primary button inside app-shell-header has nearly the same color/,
      );
    },
    T,
  );
  it(
    "a prohibition on a part's text never writes the forbidden color",
    async test => {
      needsBases(test);
      for (const q of [
        'never use pure black for button text',
        'buttons: 3px radius, never use pure black for text',
      ])
        for (const c of (await answer(q)).all)
          expect(c, q).not.toMatch(/'#000000'/);
    },
    T,
  );
  it(
    'everything, or the theme text, takes no part from the clause before',
    async test => {
      needsBases(test);
      expect(
        (await answer('buttons: 3px radius; make everything more compact'))
          .first,
      ).toEqual(['border-radius 3px --on button', 'spacing less']);
      const text = await answer(
        'primary buttons with white text; text color #303030',
      );
      expect(text.first).toContain(
        "--color-text-primary '#303030' --mode light",
      );
    },
    T,
  );
  it(
    'a text ask after ";" is the theme\'s; a run\'s trailing mode covers it',
    async test => {
      needsBases(test);
      expect(
        (await answer('cards with a subtle shadow; 14px text')).first,
      ).toEqual(["box-shadow 'var(--shadow-low)' --on card", 'text-size 14']);
      for (const c of (await answer('cards #0f1011; main text #f7f8f8')).first)
        if (/text/.test(c)) expect(c).not.toMatch(/--on card/);
      expect(
        (
          await answer(
            'secondary buttons white with a 1px border and a small shadow in light mode',
          )
        ).first[0],
      ).toBe(
        "background-color '#ffffff' --on button --when variant:secondary --mode light",
      );
      expect(
        (
          await answer(
            'primary buttons black with white text in light mode and white with black text in dark mode',
          )
        ).first,
      ).toEqual([
        "background-color '#000000' --on button --when variant:primary --mode light",
        "color '#ffffff' --on button --when variant:primary --mode light",
        "background-color '#ffffff' --on button --when variant:primary --mode dark",
        "color '#000000' --on button --when variant:primary --mode dark",
      ]);
    },
    T,
  );
  it(
    'wild: links unreadable on one page go to the other mode; dial clauses stay whole',
    async test => {
      needsBases(test);
      expect((await answer('links dark blue #0033aa')).first).toEqual([
        "--color-text-accent '#0033aa' --mode light",
      ]);
      expect((await answer('pill buttons, larger text')).first).toEqual([
        'corners pill --on button',
        'text-size more',
      ]);
      expect(
        (await answer('cards: 24px radius; roomier spacing')).first,
      ).toEqual(['border-radius 24px --on card', 'spacing more']);
      expect(
        (await answer('sepia page #f6f0e4 in light mode, dark brown text'))
          .first,
      ).toEqual([
        // (The page joins with its frame and main panel lines.)
        "--color-background-body '#f6f0e4' --mode light",
        "background-color '#f6f0e4' --on app-shell --mode light",
        "background-color '#f6f0e4' --on layout-content --mode light",
        "--color-text-primary '#92400e' --mode light",
      ]);
      // (A part's own text said with it after a comma stays the part's;
      // the whole look given, the destructive button keeps its red.)
      expect((await answer('buttons blue, white text')).first).toEqual([
        "background-color '#2563eb' --on button --when variant:primary",
        "background-color '#2563eb' --on button --when variant:secondary",
        "background-color '#2563eb' --on button --when variant:ghost",
        "color '#ffffff' --on button",
      ]);
    },
    T,
  );
  it(
    'a size word before what changes is the amount',
    async test => {
      needsBases(test);
      expect((await answer('a small shadow on inputs')).first).toEqual([
        "box-shadow 'var(--shadow-low)' --on inputs",
      ]);
      for (const c of (await answer('large padding on buttons')).first)
        expect(c).not.toMatch(/--when size:/);
      expect((await answer('make small buttons red')).first).toEqual([
        "background-color '#dc2626' --on button --when size:sm",
      ]);
    },
    T,
  );
});
