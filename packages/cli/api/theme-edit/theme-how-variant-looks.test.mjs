// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how`: a color asked of a part with variants or states
 * reaches the ones it reads on and keeps each one's meaning; a gray on a
 * surface is the theme's gray step and its mirror in dark mode; the text
 * on a ground changes the text, never the ground.
 *
 * @position api/theme-edit — tests
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;
/** Why a bundled base could not be installed here, when one could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-how-variant-looks-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) return;
  await themeEditNew('n', {cwd, like: 'neutral'});
  // (A theme that already fills one badge variant itself.)
  await themeEditNew('bf', {cwd, like: 'neutral'});
  await themeEditSet('bf', 'background-color', '#dcfce7', {
    cwd,
    on: 'badge',
    when: 'variant:success',
  });
}, 600_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** @param {string} q @param {string} [theme] */
const answer = async (q, theme = 'n') => {
  const {data} = await themeEditHow(q, {cwd, theme});
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
    texts: results.map(r => r.text),
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

describe('a color asked of every variant', () => {
  it(
    'a fill with its text given keeps the destructive red',
    async test => {
      needsBases(test);
      const r = await answer('gold buttons with black text');
      expect(r.first).toContain(
        "background-color '#ca8a04' --on button --when variant:primary",
      );
      for (const c of r.first)
        expect(c).not.toMatch(/background-color.*variant:destructive/);
      expect(r.texts[0]).toMatch(/destructive keeps its status color/);
    },
    T,
  );
  it(
    'a text color skips the variants it would vanish on',
    async test => {
      needsBases(test);
      const r = await answer('buttons with white text');
      expect(r.first).toContain(
        "color '#ffffff' --on button --when variant:primary",
      );
      for (const c of r.first) expect(c).not.toMatch(/variant:ghost/);
      expect(r.texts[0]).toMatch(/ghost keeps its own text/);
    },
    T,
  );
  it(
    'a bare color every variant reads on stays every variant',
    async test => {
      needsBases(test);
      expect((await answer('make buttons blue')).first[0]).toBe(
        "background-color '#2563eb' --on button",
      );
    },
    T,
  );
});

describe('a plain fill on a part with colored variants', () => {
  it(
    'reaches the neutral variants; each colored one keeps its own, with a line to change it',
    async test => {
      needsBases(test);
      const r = await answer('white cards');
      expect(r.first).toEqual(
        ['default', 'transparent', 'muted'].map(
          v =>
            `background-color '#ffffff' --on card --when variant:${v} --mode light`,
        ),
      );
      expect(r.texts[0]).toMatch(
        /blue, cyan, .* card variants keep their own color/,
      );
      expect(r.all).toContain(
        "background-color '#ffffff' --on card --when variant:blue --mode light",
      );
      // (A named variant is that variant alone.)
      expect((await answer('make the blue cards rounder')).first).toEqual([
        'corners more --on card --when variant:blue',
      ]);
    },
    T,
  );
});

describe('no fill', () => {
  it(
    'is see-through on the part and on each variant the theme fills itself, never a fill taken back',
    async test => {
      needsBases(test);
      for (const q of [
        'badges outlined, no fill',
        'badges: no fill',
        'badges with no background',
      ]) {
        const r = await answer(q, 'bf');
        expect(r.all, q).toContain('background-color transparent --on badge');
        expect(r.all, q).toContain(
          'background-color transparent --on badge --when variant:success',
        );
        expect(r.all.join('\n'), q).not.toMatch(/^undo /m);
      }
    },
    T,
  );
});

describe('a gray on a surface', () => {
  it(
    "is the theme's gray step, mirrored in dark mode",
    async test => {
      needsBases(test);
      expect((await answer('table header row gray')).first[0]).toBe(
        "background-color 'light-dark(#9e9e9e, #525252)' --on table-header-cell",
      );
      // (A control's fill, a button's, is the color asked.)
      expect(
        (await answer('secondary buttons with a gray background')).first[0],
      ).toBe("background-color '#9e9e9e' --on button --when variant:secondary");
    },
    T,
  );
});

describe('the text on a ground', () => {
  it(
    'changes the text, never the ground',
    async test => {
      needsBases(test);
      for (const c of (await answer('make the text on the gradient white')).all)
        expect(c).not.toMatch(/--color-background-body|background/);
    },
    T,
  );
});

describe('toggle buttons', () => {
  it(
    'are the toggle buttons, never a switch',
    async test => {
      needsBases(test);
      expect((await answer('pressed toggle buttons red')).first[0]).toBe(
        "background-color '#dc2626' --on toggle-button --state isPressed",
      );
    },
    T,
  );
});
