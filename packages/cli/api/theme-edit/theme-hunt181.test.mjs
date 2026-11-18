// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how` keeps an except apart only when one --when can hold
 * it, gives a comma-led or part-less except to every part of the ask,
 * reads a mode pair as one subject, keeps a heading level said with a
 * digit, reads articles in neither/nor, gives a removal's thing to each
 * bare "from" item, gives every ask after a list of parts to each part,
 * and pins a kept part of a group in each scope of the step.
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
  cwd = makeLinkedFixture('astryx-theme-hunt181-', FIXTURE_PACKAGES);
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

const T = 180_000;

describe('excepts', () => {
  it(
    'an except on another axis cannot be kept apart, and says so',
    async test => {
      needsBases(test);
      for (const q of [
        'make buttons blue except the small ones',
        'make secondary buttons red except the large ones',
        'make the large buttons rounder except the primary ones',
      ]) {
        const r = await answer(q);
        expect(r.text).toMatch(/cannot be kept apart/);
        expect(r.text).not.toMatch(/nothing this change sets to keep/);
      }
      // (The same axis still keeps: a size kept from a size step.)
      expect(
        (await answer('make buttons taller except the large ones')).first,
      ).toContain('set n spacing medium --on button --when size:lg');
    },
    T,
  );
  it(
    'a comma-led or part-less except reaches every part of the ask',
    async test => {
      needsBases(test);
      for (const q of [
        'make buttons, inputs and selects taller except the large ones',
        'make buttons, inputs and selects taller, except the large ones',
      ]) {
        const r = await answer(q);
        for (const on of ['button', 'inputs', 'selector'])
          expect(
            r.first.some(
              x => x.includes(`--on ${on} `) && x.includes('--when size:lg'),
            ),
          ).toBe(true);
      }
      const comma = await answer(
        'make buttons blue, except the small ones, and bolder',
      );
      expect(comma.text).toMatch(/size sm/);
    },
    T,
  );
  it(
    'a kept group member keeps each status and mode of the step',
    async test => {
      needsBases(test);
      const r = await answer(
        'make every input border blue in light mode but not selectors',
      );
      const pins = r.first.filter(x => x.includes('--on selector'));
      expect(pins.length).toBeGreaterThan(1);
      for (const pin of pins) expect(pin).toMatch(/--mode light/);
      expect(pins).toContain(
        "set n border-color 'var(--color-border-error)' --on selector --when status:error --mode light --only",
      );
    },
    T,
  );
});

describe('subjects, keeps and lists', () => {
  it(
    'a mode pair is one subject wherever its part is said',
    async test => {
      needsBases(test);
      const r = await answer(
        'make the text darker in dark mode and lighter in light mode on cards',
      );
      expect(r.first.length).toBe(2);
      for (const x of r.first)
        expect(x).toMatch(/^set n color .* --on card --mode (dark|light)$/);
      const done = await answer(
        'make card text lighter in dark mode and darker in light mode',
      );
      expect(done.text).toMatch(/already as light as it goes in dark mode/);
    },
    T,
  );
  it(
    'keep h1, neither a/nor a, bare "from" items, and every ask of a part list',
    async test => {
      needsBases(test);
      const h = await answer('make headings smaller but keep h1');
      expect(h.first.join('\n')).not.toMatch(/--text-heading-1-/);
      expect(
        (await answer('cards should have neither a border nor a shadow')).first,
      ).toEqual([
        'set n border none --on card',
        'set n box-shadow none --on card',
      ]);
      expect(
        (
          await answer(
            'remove the shadow from popovers, from menus and from tooltips',
          )
        ).first,
      ).toEqual([
        'set n box-shadow none --on popover',
        'set n box-shadow none --on dropdown-menu',
        'set n box-shadow none --on tooltip',
      ]);
      const list = await answer(
        'make cards and dialogs rounder and remove their shadows',
      );
      expect(list.first).toContain('set n corners more --on card');
      expect(list.first).toContain('set n corners more --on dialog');
      expect(
        (await answer('make buttons and cards rounder and inputs red')).first,
      ).toContain('set n corners more --on button');
    },
    T,
  );
});

describe('chaos39', () => {
  it(
    'neither/nor parts as the subject, a second from, two asks after a list',
    async test => {
      needsBases(test);
      expect(
        (await answer('neither cards nor dialogs should have shadows')).first,
      ).toEqual([
        'set n box-shadow none --on card',
        'set n box-shadow none --on dialog',
      ]);
      expect(
        (await answer('neither buttons nor inputs should be rounded')).first,
      ).toEqual([
        'set n corners square --on button',
        'set n corners square --on inputs',
      ]);
      expect(
        (await answer('remove the shadows from cards and from dialogs')).first,
      ).toEqual([
        'set n box-shadow none --on card',
        'set n box-shadow none --on dialog',
      ]);
      const two = await answer('make cards rounder and red');
      expect(two.first).toEqual([
        'set n corners more --on card',
        "set n background-color '#dc2626' --on card",
      ]);
      const bold = await answer('make headings bold and red');
      expect(bold.first).toContain("set n color '#dc2626' --on heading");
    },
    T,
  );
  it(
    'a list item excepted, a mode said first, indicators, every, keep h2',
    async test => {
      needsBases(test);
      expect(
        (
          await answer(
            'make cards, dialogs and popovers rounder except popovers',
          )
        ).first,
      ).toEqual([
        'set n corners more --on card',
        'set n corners more --on dialog',
      ]);
      const split = await answer(
        'in dark mode make hovered rows lighter, in light mode darker',
      );
      expect(split.first.some(x => x.endsWith('--mode dark'))).toBe(true);
      expect(split.first.some(x => x.endsWith('--mode light'))).toBe(true);
      expect(
        (await answer('make indicator focus rings blue')).first[0],
      ).toMatch(/--on checks$/);
      expect(
        (await answer('remove every shadow except on dialogs')).text,
      ).toMatch(/except dialog/);
      expect(
        (await answer('make headings smaller but keep h2')).first.join('\n'),
      ).not.toMatch(/--text-heading-2-/);
    },
    T,
  );
});
