// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how` guards: the way of a line (a fainter or removal ask
 * never adds or strengthens a border, outline, ring or shadow anywhere, and
 * a way asked of a line never adds one where Core drew none), kept scopes
 * held after the whole sequence, a question that never writes, and an
 * unknown part never read as the whole theme; plus the readers the guards
 * point to.
 *
 * @position api/theme-edit — tests
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

// The assertions are about settings, builds, notes and lines, not rendered
// pages: a render costs seconds, so the pages are written by the stand-in.
vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

/** @type {string} */
let cwd;
/** Why a bundled base could not be installed here, when one could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt208-', FIXTURE_PACKAGES);
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
      .map(c => c.replace(/^.* editor /, ''));
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

// A write that adds or strengthens a line: a border box or width, a wider
// ring, or a shared shadow stepped up on a part.
const STRONGER =
  /set n (?:border '|border-width [1-9]|--focus-outline-width [3-9]|box-shadow 'var\(--shadow-(?:med|high)\)')/;

describe('the direction guard', () => {
  it(
    'a fainter or removal ask never adds or strengthens a line, in any phrasing',
    async test => {
      needsBases(test);
      for (const q of [
        'make the card border less visible',
        'card borders fainter',
        'make the card border half as visible',
        'make the dialog border less visible',
        'make the card shadow half as visible',
        'make the popover shadow less visible',
        'make the focus ring 50% transparent',
        'make the focus ring more see-through',
        'remove the border from cards, dialogs and popovers, and the shadow from menus',
      ]) {
        const r = await answer(q);
        for (const c of r.all) expect(c, q).not.toMatch(STRONGER);
      }
    },
    T,
  );
  it(
    'a way asked of a line never adds one where Core drew none',
    async test => {
      needsBases(test);
      // (Nor a width that reaches the controls inside: the cells draw the
      // row line at a width Core sets per render, so nothing is written
      // and the answer says why.)
      const r = await answer('make the table row dividers thicker');
      expect(r.all).toEqual([]);
      expect(r.text).toMatch(
        /table-row dividers are drawn by .*per render; the editor can't change that width without touching the borders of the controls inside/,
      );
      const card = await answer('make card borders thicker');
      // (A width only: the card variants that draw no border stay without.)
      for (const c of card.all) expect(c).not.toMatch(/set n border '/);
    },
    T,
  );
  it(
    'the readers it points to: a fainter border color, a see-through text, a ring color',
    async test => {
      needsBases(test);
      expect(
        (await answer('make the card border less visible')).first[0],
      ).toMatch(/^set n --color-border '#[0-9a-f]{8}' --on card --mode light$/);
      expect(
        (await answer('make the dialog border less visible')).text,
      ).toMatch(/dialog draws no border/);
      const text = await answer('make the text more transparent');
      expect(text.first[0]).toMatch(
        /^set n --color-text-primary '#000000[0-9a-f]{2}'/,
      );
      expect(text.all.join('\n')).not.toMatch(/--color-background-body/);
      expect((await answer('make all text 50% transparent')).first[0]).toBe(
        "set n --color-text-primary '#00000080' --mode light",
      );
      expect(
        (await answer('make the focus ring 50% transparent')).first[0],
      ).toMatch(/^set n --focus-outline-color '#[0-9a-f]{6}80'/);
      expect((await answer('make shadows blurrier')).text).toMatch(
        /blurrier shadows everywhere: each shared shadow with its blur ×1\.5/,
      );
    },
    T,
  );
});

describe('the keep guard', () => {
  it(
    'a compound except keeps that variant in that state, in any phrasing',
    async test => {
      needsBases(test);
      for (const q of [
        'make buttons red except disabled ghost buttons',
        'make buttons rounder except secondary buttons when disabled',
        'make buttons red except the disabled secondary ones',
      ]) {
        const pins = (await answer(q)).first.slice(1);
        expect(pins.length, q).toBeGreaterThan(0);
        for (const x of pins)
          expect(x, q).toMatch(/--when variant:\w+ --state disabled/);
      }
    },
    T,
  );
  it(
    'keeps said first, excepts with modes and states that stay with their clause',
    async test => {
      needsBases(test);
      const h = await answer('keep h1 and h2 and make every heading bigger');
      expect(h.first.join('\n')).not.toMatch(/--text-heading-[12]-|level:[12]/);
      const st = await answer(
        'make inputs red except when focused, and rounder',
      );
      expect(st.all).toContain('set n corners more --on inputs');
      const d2 = await answer(
        'make buttons red in dark mode except the ghost ones, and rounder',
      );
      expect(d2.all).toContain('set n corners more --on button');
      const f8 = await answer(
        'make buttons red, except primary in dark mode and secondary in light mode',
      );
      expect(f8.first).toContain(
        "set n background-color '#dc2626' --on button",
      );
      expect(f8.first.some(x => /variant:primary --mode dark$/.test(x))).toBe(
        true,
      );
      expect(
        f8.first.some(x => /variant:secondary --mode light$/.test(x)),
      ).toBe(true);
      const r4 = await answer('make buttons red except primary in dark mode');
      expect(r4.first.some(x => /--when variant:primary/.test(x))).toBe(true);
      const sq = await answer('make the buttons square except the small ones');
      expect(sq.first).toEqual([
        'set n corners square --on button',
        expect.stringMatching(/--on button --when size:sm$/),
      ]);
    },
    T,
  );
  it(
    'the in-order sequence runs the except with its keeps',
    async test => {
      needsBases(test);
      const r = await answer(
        'make buttons and inputs taller except the large ones and bolder',
      );
      expect(r.first).toEqual([
        'set n spacing more --on button',
        'set n spacing more --on inputs',
        'set n spacing medium --on button --when size:lg',
        'set n spacing medium --on inputs --when size:lg',
        'set n font-weight 700 --on button',
        'set n font-weight 700 --on inputs',
      ]);
    },
    T,
  );
});

describe('the question guard and the unknown-part guard', () => {
  it(
    'a question with no ask never writes, in any phrasing',
    async test => {
      needsBases(test);
      for (const q of [
        'how heavy is the text',
        'what weight are the headings',
        'how thick are the borders',
        'is the card shadow strong',
      ])
        expect((await answer(q)).all, q).toEqual([]);
      for (const q of [
        'how heavy are headings - set them bold',
        'what color is the page? make it white',
        'are links underlined... underline them',
      ])
        expect((await answer(q)).all.length, q).toBeGreaterThan(0);
    },
    T,
  );
  it(
    'an unknown part is said, never read as the whole theme',
    async test => {
      needsBases(test);
      for (const q of [
        'make widgets rounder',
        'remove the shadow from widgets',
        'remove the shadow from cards and from widgets',
      ]) {
        const r = await answer(q);
        expect(r.text, q).toMatch(/no part is called "widget"/);
        for (const c of r.all) expect(c, q).toMatch(/--on /);
      }
    },
    T,
  );
});

describe('FINAL-39 readers', () => {
  it(
    'removal lists, links in a place, outline buttons in a color, a held accent',
    async test => {
      needsBases(test);
      expect(
        (
          await answer(
            'remove the border from cards, dialogs and popovers, and the shadow from menus',
          )
        ).first,
      ).toEqual([
        'set n border none --on card',
        'set n border none --on dialog',
        'set n border none --on popover',
        'set n box-shadow none --on dropdown-menu',
      ]);
      expect((await answer('make the links on cards red')).first).toEqual([
        "set n --color-text-accent '#dc2626' --on card",
      ]);
      // (The outline look, never a border over every filled button.)
      const outline = await answer('make the outline buttons red');
      expect(outline.first).toContain('set n buttons outline');
      for (const c of outline.all)
        expect(c).not.toMatch(/border '1px solid #dc2626' --on button$/);
      const acc = await answer(
        'make the accent darker but never darker than #1e40af',
      );
      expect(acc.all.join('\n')).not.toMatch(/set n accent '#16/);
    },
    T,
  );
});

describe('chaos41 guard items', () => {
  it(
    'a kept bound already held writes nothing; a wrong-way mode is dropped alone; a thicker border on a part with none is refused',
    async test => {
      needsBases(test);
      const kept = await answer(
        'keep the accent darker than #333 in light mode and lighter than #ccc in dark mode',
      );
      expect(kept.all).toEqual([]);
      expect(kept.text).toMatch(/already darker than #333 in light mode/);
      const warn = await answer('make warning text darker');
      expect(warn.first).toEqual([
        expect.stringMatching(
          /^set n --color-text-warning '#[0-9a-f]{6}' --mode light$/,
        ),
      ]);
      expect(warn.text).toMatch(/so only the other mode is changed/);
      const header = await answer('make the header bar border thicker');
      expect(header.all).toEqual([]);
      expect(header.text).toMatch(/where Core draws none/);
    },
    T,
  );
});
