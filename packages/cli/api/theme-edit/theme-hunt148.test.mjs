// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `how` with a bound past which the part already is, a direction
 * beside a bound on a property with no scale of its own, the body text
 * with a bound, a theme color with a way, the page's color as a gradient
 * stop, a role color's way on a dark-only theme, "the same as" after a
 * color property, and a value question about the page.
 *
 * @position api/theme-edit — tests
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

const T = 240_000;

/** @type {string} */
let cwd;
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt148-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('q', {cwd, like: 'neutral'});
  await themeEditNew('dk', {
    cwd,
    like: 'neutral',
    settings: {mode: 'dark-only'},
  });
}, T);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/**
 * The answer's results, each with its text and the commands it runs.
 * @param {string} q @param {string} [theme]
 */
const how = async (q, theme = 'q') => {
  const {data} = await themeEditHow(q, {cwd, theme});
  return data.results;
};
/** Every command of every result. @param {any[]} rs */
const cmds = rs => rs.flatMap(r => r.commands);

describe('a bound', () => {
  it(
    'already passed the way the words ask writes nothing',
    async () => {
      const rs = await how('make cards rounder but at most 4px');
      expect(cmds(rs).filter(c => / editor set /.test(c))).toEqual([]);
      expect(rs[0].text).toMatch(/already past 4px/);
    },
    T,
  );

  it(
    'beside a growing word, on a property with no scale, goes to the bound',
    async () => {
      const rs = await how('make buttons taller but at most 40px');
      expect(cmds(rs)[0]).toMatch(/ set q height 40px --on button$/);
    },
    T,
  );

  it(
    'on the body text is the base text size',
    async () => {
      const rs = await how('make the body text 1px bigger but at most 16px');
      expect(cmds(rs)[0]).toMatch(/ set q text-size \d+$/);
    },
    T,
  );
});

describe('a theme color with a way', () => {
  it(
    'is that color made that way in each mode',
    async () => {
      const rs = await how('make links the accent color but darker');
      const c = cmds(rs);
      expect(c).toContainEqual(
        expect.stringMatching(
          / set q --color-text-accent '#[0-9a-f]+' --mode light$/,
        ),
      );
      expect(c).toContainEqual(
        expect.stringMatching(
          / set q --color-text-accent '#[0-9a-f]+' --mode dark$/,
        ),
      );
    },
    T,
  );
});

describe('the page color as a gradient stop', () => {
  it(
    'is the color the page is painted with, on the part asked only',
    async () => {
      const rs = await how(
        'make cards a gradient from the page color to the accent',
      );
      const c = cmds(rs);
      expect(c[0]).toContain(
        "linear-gradient(var(--color-background-body), var(--color-accent))' --on card",
      );
      for (const x of c) expect(x).not.toMatch(/--on app-shell\b/);
    },
    T,
  );
});

describe('a role color on a dark-only theme', () => {
  it(
    'darker moves each of its tokens darker, never refused for its text',
    async () => {
      const rs = await how('make the danger color darker', 'dk');
      expect(cmds(rs)).toContainEqual(
        expect.stringMatching(/ set dk --color-text-error '#[0-9a-f]+'$/),
      );
    },
    T,
  );
});

describe('"the same as" after a color property', () => {
  it(
    "is the other part's color",
    async () => {
      const rs = await how('make the dialog background the same as cards');
      expect(cmds(rs)[0]).toMatch(
        / set q background-color 'var\(--color-background-card\)' --on dialog$/,
      );
    },
    T,
  );
});

describe('a value question about the page', () => {
  it(
    'gives the color the page is painted with, in each mode',
    async () => {
      const rs = await how('what color is the page');
      expect(rs[0].text).toMatch(
        /in light mode, .* in dark mode \(--color-background-body/,
      );
      expect(cmds(rs)).toEqual([
        expect.stringMatching(/ how --color-background-body$/),
      ]);
    },
    T,
  );
});
