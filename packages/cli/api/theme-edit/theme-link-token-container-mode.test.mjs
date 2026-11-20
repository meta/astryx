// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how` sets a link's token on the container a mode pair
 * names, offers runnable lookups, gives a removal's trailing items to the
 * last "from", reads "give neither … a thing" as a removal, keeps a
 * compound except as both conditions, answers an ask after an except, and
 * matches each item of a list to a reference.
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
  cwd = makeLinkedFixture(
    'astryx-theme-link-token-container-mode-',
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
const how = async q => {
  const {data} = await themeEditHow(q, {cwd, theme: 'n'});
  return data.results ?? [];
};
/** @param {string} q */
const answer = async q => {
  const results = await how(q);
  return {
    first: (
      results.find(r => r.commands.some(c => / editor set /.test(c)))
        ?.commands ?? []
    ).map(c => c.replace(/^.* editor /, '')),
    all: results
      .flatMap(r => r.commands)
      .map(c => c.replace(/^.* editor /, '')),
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

describe('link token container mode', () => {
  it(
    'links in a mode pair on cards: the token on the card, both modes',
    async test => {
      needsBases(test);
      const r = await answer(
        'make links darker in light mode and lighter in dark mode on cards',
      );
      expect(r.first).toHaveLength(2);
      for (const x of r.first)
        expect(x).toMatch(
          /^set n --color-text-accent '#[0-9a-f]+' --on card --mode (light|dark)$/,
        );
    },
    T,
  );
  it(
    'a lookup is a command that runs',
    async test => {
      needsBases(test);
      const results = await how(
        'make the card text lighter in dark mode and darker in light mode',
      );
      for (const c of results.flatMap(x => x.commands))
        expect(c).toMatch(/ how card$/);
    },
    T,
  );
  it(
    'removals: trailing items join the last from; give neither is a removal',
    async test => {
      needsBases(test);
      expect(
        (
          await answer(
            'remove the border from cards and the shadow from dialogs and popovers',
          )
        ).first,
      ).toEqual([
        'set n border none --on card',
        'set n box-shadow none --on dialog',
        'set n box-shadow none --on popover',
      ]);
      expect(
        (await answer('give neither the cards nor the popovers a border'))
          .first,
      ).toEqual([
        'set n border none --on card',
        'set n border none --on popover',
      ]);
    },
    T,
  );
  it(
    'a compound except keeps that variant in that state only',
    async test => {
      needsBases(test);
      const r = await answer(
        'make buttons red except the disabled secondary ones',
      );
      const pins = r.first.slice(1);
      expect(pins.length).toBeGreaterThan(0);
      for (const x of pins)
        expect(x).toMatch(/--when variant:secondary --state disabled$/);
    },
    T,
  );
  it(
    'an ask after an except reaches every part; a list matches a reference',
    async test => {
      needsBases(test);
      const r = await answer(
        'make buttons and inputs taller except the large ones and bolder',
      );
      for (const on of ['button', 'inputs']) {
        expect(r.all).toContain(`set n font-weight 700 --on ${on}`);
        expect(r.all).toContain(`set n spacing more --on ${on}`);
      }
      expect(
        (
          await answer(
            'make the header and the sidebar the same color as the page',
          )
        ).first,
      ).toEqual([
        "set n background-color 'var(--color-background-body)' --on app-shell-header",
        "set n background-color 'var(--color-background-body)' --on side-nav",
      ]);
      expect((await answer('make all text except headings red')).first[0]).toBe(
        "set n --color-text-primary '#dc2626'",
      );
    },
    T,
  );
});

describe('link token container mode', () => {
  it(
    'a step that changes nothing is left out of the sequence; step counts hold',
    async test => {
      needsBases(test);
      const r = await how('make buttons and badges rounder and red');
      expect(r[0].text).toMatch(/^all of it, in order; left out: .*badge/);
      expect(r[0].commands).toHaveLength(3);
      const two = await answer(
        'make buttons 2 steps rounder and 1 step taller',
      );
      expect(two.first).toEqual([
        'set n corners more --on button',
        'set n corners more --on button',
        'set n spacing more --on button',
      ]);
    },
    T,
  );
  it(
    'keeps after a comma, shadow tokens kept on the part, a value color in a keep',
    async test => {
      needsBases(test);
      const bold = await answer('make headings bolder, keep h1 and h2');
      expect(bold.text).toMatch(/level 1/);
      expect(bold.text).toMatch(/level 2/);
      const card = await answer('remove every shadow except on cards');
      for (const t of ['low', 'med', 'high'])
        expect(
          card.first.some(
            x =>
              x.startsWith(`set n --shadow-${t} '`) && x.endsWith('--on card'),
          ),
        ).toBe(true);
      expect(card.first).not.toContain('set n box-shadow none --on card');
      const gray = await answer(
        'make checkboxes red but keep disabled ones gray',
      );
      expect(gray.text).not.toMatch(/variant gray/);
      expect(gray.first.some(x => x.includes('--state disabled'))).toBe(true);
    },
    T,
  );
  it(
    'an except in one mode stays with its clause or its part',
    async test => {
      needsBases(test);
      const r = await answer(
        'make cards rounder, except in dark mode, and buttons red',
      );
      expect(r.all).toContain("set n background-color '#dc2626' --on button");
      const d = await answer(
        'make cards and dialogs darker, except the dialog in dark mode',
      );
      const dialog = d.first.filter(x => x.includes('--on dialog'));
      expect(dialog.length).toBeGreaterThan(0);
      for (const x of dialog) expect(x).toMatch(/--mode light$/);
    },
    T,
  );
  it(
    'a prohibition of a look first, and tone words for text in a mode pair',
    async test => {
      needsBases(test);
      const r = await answer(
        'never use rounded corners on buttons; make everything rounder',
      );
      expect(r.first[0]).toBe('set n corners more');
      expect(r.first.join('\n')).toMatch(/--on button/);
      const t = await answer(
        'make card text dark in light mode and light in dark mode',
      );
      expect(t.first.some(x => /--on card --mode light$/.test(x))).toBe(true);
      expect(t.first.some(x => /--on card --mode dark$/.test(x))).toBe(true);
    },
    T,
  );
});
