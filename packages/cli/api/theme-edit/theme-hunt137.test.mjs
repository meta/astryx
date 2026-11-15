// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how` through its shared readers: lists of variants and
 * states named once each, an except of states, one-mode shadows read to
 * their layers (or refused with the true reason), rings a resting shadow
 * would wipe, a line's color by mode, a color's steps in each mode's own
 * terms, swaps of every role color, built radii in comparisons, theme
 * colors as gradient stops, Core's elevation under no shadow, the except
 * over the whole ask, a prohibition before the ask, the body text size,
 * a group's corners, a kept light-dark() pin in one mode, text-only parts,
 * surfaces' value questions, a direction held to a bound, a kept font and
 * a state's wash.
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
  cwd = makeLinkedFixture('astryx-theme-hunt137-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral', 'butter', 'stone']);
  if (unbuilt) return;
  await themeEditNew('n', {cwd, like: 'neutral'});
  await themeEditNew('b', {cwd, like: 'butter'});
  await themeEditNew('bdo', {cwd, like: 'butter'});
  await themeEditSet('bdo', 'mode', 'dark-only', {cwd});
  await themeEditNew('st', {cwd, like: 'stone'});
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
    results,
  };
};

/** @param {import('vitest').TestContext} test */
const needsBases = test => {
  if (unbuilt) {
    console.warn(`skipped: ${unbuilt}`);
    test.skip();
  }
};

const T = 180_000;

describe('lists and excepts', () => {
  it(
    'every ask said of a list goes with each item, up to an except',
    async test => {
      needsBases(test);
      expect(
        (await answer('make primary and ghost buttons blue and cards red'))
          .first,
      ).toEqual([
        "set n background-color '#2563eb' --on button --when variant:primary",
        "set n background-color '#2563eb' --on button --when variant:ghost",
        "set n background-color '#dc2626' --on card",
      ]);
      const kept = await answer(
        'make primary and ghost buttons blue except disabled ones',
      );
      for (const v of ['primary', 'ghost']) {
        expect(kept.first).toContain(
          `set n background-color '#2563eb' --on button --when variant:${v}`,
        );
        expect(
          kept.first.some(x =>
            x.includes(`--when variant:${v} --state disabled`),
          ),
        ).toBe(true);
      }
      const both = await answer(
        'give primary and ghost buttons a border and a shadow',
      );
      for (const v of ['primary', 'ghost'])
        for (const prop of ['border', 'box-shadow'])
          expect(
            both.first.some(
              x => x.startsWith(`set n ${prop} `) && x.endsWith(`variant:${v}`),
            ),
          ).toBe(true);
      const their = await answer(
        'make primary and ghost buttons blue and their text white',
      );
      for (const v of ['primary', 'ghost'])
        expect(their.first).toContain(
          `set n color '#ffffff' --on button --when variant:${v}`,
        );
    },
    T,
  );
  it(
    'a list of variants or states names each one',
    async test => {
      needsBases(test);
      expect(
        (await answer('make primary and secondary buttons green')).first,
      ).toEqual([
        "set n background-color '#16a34a' --on button --when variant:primary",
        "set n background-color '#16a34a' --on button --when variant:secondary",
      ]);
      expect(
        (await answer('hovered and pressed buttons should be orange')).first,
      ).toEqual([
        "set n background-color '#f97316' --on button --state hover",
        "set n background-color '#f97316' --on button --state active",
      ]);
      const comma = await answer(
        'make everything rounder except primary, secondary and ghost buttons',
      );
      for (const v of ['primary', 'secondary', 'ghost'])
        expect(comma.first.join('\n')).toContain(`--when variant:${v}`);
      expect(comma.text).not.toMatch(/second brand/);
    },
    T,
  );
  it(
    'an except of states pins each state',
    async test => {
      needsBases(test);
      const r = await answer(
        'make everything rounder except disabled and hovered buttons',
      );
      expect(r.first[0]).toBe('set n corners more');
      expect(r.first.join('\n')).toMatch(/--on button --state disabled/);
      expect(r.first.join('\n')).toMatch(/--on button --state hover/);
      expect(r.text).not.toMatch(/""/);
    },
    T,
  );
  it(
    'an except belongs to the whole ask: one sequence',
    async test => {
      needsBases(test);
      const r = await answer(
        'remove borders from cards and buttons but keep the inputs',
      );
      expect(r.first).toEqual([
        'set n border none --on card',
        'set n border none --on button',
      ]);
    },
    T,
  );
  it(
    'a prohibition before the ask is read after it',
    async test => {
      needsBases(test);
      const r = await answer('never round the inputs; make everything rounder');
      expect(r.first[0]).toBe('set n corners more');
      expect(r.first.join('\n')).toMatch(/--on text-input/);
      // ("don't make …" before the ask is read the same.)
      const dont = await answer(
        "don't make cards rounder, make everything rounder",
      );
      expect(dont.first[0]).toBe('set n corners more');
      expect(dont.first.join('\n')).toMatch(/--on card/);
    },
    T,
  );
  it(
    'a kept font is pinned on the part',
    async test => {
      needsBases(test);
      const r = await answer('make everything serif except headings');
      expect(r.first[0]).toBe('set n font serif');
      expect(r.first[1]).toMatch(/^set n font-family '.+' --on heading$/);
    },
    T,
  );
});

describe('vocabulary words with hyphens', () => {
  it(
    'a hyphenated or underscored part reads as the same words',
    async test => {
      needsBases(test);
      const spaced = await answer('make the focus ring red');
      expect(spaced.first.length).toBeGreaterThan(0);
      for (const q of ['make the focus-ring red', 'make the focus_ring red'])
        expect((await answer(q)).first).toEqual(spaced.first);
      expect((await answer('border-radius 8px on cards')).first[0]).toMatch(
        /^set n border-radius 8px --on card/,
      );
    },
    T,
  );
});

describe('one mode', () => {
  it(
    'a shared shadow is read to its layers; an unknown part is refused truly',
    async test => {
      needsBases(test);
      const card = await answer('make card shadows darker in dark mode');
      expect(card.first[0]).toMatch(
        /^set n box-shadow '.*light-dark\(transparent, .*' --on card$/,
      );
      const pop = await answer('make popover shadows blue in light mode');
      expect(pop.first).toEqual([]);
      expect(pop.text).toMatch(/what popover shows in dark mode is unknown/);
      const removal = await answer('remove card shadows in dark mode');
      expect(removal.first).toEqual([]);
      expect(removal.text).not.toMatch(/no color of its own/);
    },
    T,
  );
  it(
    'a resting shadow on a part that rings itself is not offered',
    async test => {
      needsBases(test);
      const r = await answer(
        'in dark mode, inputs should have shadow 0 2px 6px #00000066',
      );
      expect(r.first).toEqual([]);
      expect(r.text).toMatch(/rings in its box-shadow/);
    },
    T,
  );
  it(
    'a line the part draws takes its color by mode',
    async test => {
      needsBases(test);
      expect(
        (
          await answer(
            'in dark mode, table header cell borders should be #ff0000',
          )
        ).first,
      ).toEqual([
        "set n border-color '#ff0000' --on table-header-cell --mode dark",
      ]);
      await expect(
        themeEditSet('n', 'border', '1px solid #f00', {
          cwd,
          on: 'card',
          mode: 'dark',
        }),
      ).rejects.toMatchObject({
        suggestions: expect.arrayContaining([
          expect.objectContaining({
            name: expect.stringMatching(
              /set n border-color '#f00' --on card --mode dark$/,
            ),
          }),
        ]),
      });
    },
    T,
  );
  it(
    'a kept light-dark() pin is written as the mode’s half',
    async test => {
      needsBases(test);
      const r = await answer(
        'in dark mode make all buttons red except ghost ones',
        'b',
      );
      expect(r.first).toContain(
        "set b color '#fdee8c' --on button --when variant:ghost --mode dark",
      );
    },
    T,
  );
});

describe('colors in their own terms', () => {
  it(
    'a step on a color whose modes differ moves each mode from its own value',
    async test => {
      needsBases(test);
      const warm = await answer('make the accent warmer', 'b');
      expect(warm.first).toContain(
        "set b --color-text-accent '#fdc58c' --mode dark",
      );
      expect(warm.first.join('\n')).not.toMatch(/ set b accent /);
      const dark = await answer('make the accent lighter', 'bdo');
      expect(dark.first).toContain("set bdo --color-accent '#fdf1a3'");
    },
    T,
  );
  it(
    'a swap trades every role color in every mode',
    async test => {
      needsBases(test);
      const r = await answer(
        'swap the accent and danger colors in dark mode',
        'b',
      );
      expect(r.first).toContain(
        "set b --color-text-error '#fdee8c' --mode dark",
      );
    },
    T,
  );
  it(
    'theme colors are gradient stops',
    async test => {
      needsBases(test);
      expect(
        (
          await answer(
            'make primary buttons a gradient from the accent to the danger color',
          )
        ).first[0],
      ).toBe(
        "set n background 'linear-gradient(var(--color-accent), var(--color-error))' --on button --when variant:primary",
      );
    },
    T,
  );
  it(
    'a state’s wash, never the page',
    async test => {
      needsBases(test);
      const r = await answer('make the hover tint stronger');
      expect(r.first.join('\n')).toMatch(/--color-overlay-hover/);
      expect(r.first.join('\n')).not.toMatch(/--color-background-body/);
      const sel = await answer(
        'make the selected background lighter in dark mode',
      );
      expect(sel.first).toEqual([]);
    },
    T,
  );
});

describe('parts read as they are built', () => {
  it(
    'comparisons read the built radius; a group steps its corner token',
    async test => {
      needsBases(test);
      expect(
        (await answer('make cards as round as buttons', 'st')).first,
      ).toEqual(["set st border-radius 'var(--radius-full)' --on card"]);
      expect((await answer('make button groups 6px rounder')).first).toEqual([
        'set n --radius-element 16px --on button-group',
      ]);
    },
    T,
  );
  it(
    'no shadow takes Core’s elevation out and keeps its ring',
    async test => {
      needsBases(test);
      await themeEditNew('ns', {cwd, like: 'neutral'});
      await themeEditSet('ns', 'box-shadow', 'none', {cwd, on: 'card'});
      const css = fs.readFileSync(path.join(cwd, 'themes/ns/ns.css'), 'utf8');
      expect(css).toMatch(/box-shadow:\s*var\(--_card-ring,0 0 transparent\);/);
      expect(css).not.toMatch(/--_card-elevation,0 0 transparent\);/);
    },
    T,
  );
  it(
    'the body text, text-only parts, surfaces and bounds',
    async test => {
      needsBases(test);
      expect((await answer('make the body text 1px bigger')).first).toEqual([
        'set n text-size 15',
      ]);
      expect((await answer('make the top nav heading white')).first).toEqual([
        "set n color '#ffffff' --on top-nav-heading",
      ]);
      expect((await answer('make card headings white')).first[0]).toBe(
        "set n color '#ffffff' --on heading",
      );
      expect((await answer('what color is the header')).text).toMatch(
        /background-color/,
      );
      expect(
        (await answer('make card padding bigger but no more than 20px')).first,
      ).toEqual(['set n padding 16px --on card']);
    },
    T,
  );
});
