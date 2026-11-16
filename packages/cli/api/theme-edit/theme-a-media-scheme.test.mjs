// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A part inside Core's media surface (a lightbox's dark island) is
 * measured as that surface draws it, in its own scheme whatever the
 * page's mode: an untouched base ships no problem there, a light-only text
 * color on the page part makes none, a problem there is listed once, and
 * its fix is a color in the surface's scheme that ends the problem; when
 * the same text on the page needs the other color, no line is offered.
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {splitCommand} from './_vet.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

const T = 400_000;
/** @type {string} */
let cwd;
/** @type {string} */
let unbuilt = '';
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-a-media-scheme-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  unbuilt = await installRealBaseThemes(cwd, ['neutral', 'butter']);
}, T);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} slug */
const open = async slug =>
  /** @type {Array<{problem: string, fix: string | null}>} */ (
    /** @type {any} */ (await themeEditShow(slug, {cwd})).data.openProblems
  );
/** @param {string} fix */
async function follow(fix) {
  const args = splitCommand(fix.slice(fix.indexOf('experimental ')));
  const r = await runCli(/** @type {string[]} */ (args), {cwd});
  expect(r.status, `${fix}\n${r.stderr}`).toBe(0);
}

describe('a part on a media surface', () => {
  it(
    'ships no problem on an untouched butter theme',
    async () => {
      if (unbuilt) return;
      await themeEditNew('b', {cwd, like: 'butter'});
      expect(
        (await open('b')).filter(p => / on lightbox /.test(p.problem)),
      ).toEqual([]);
    },
    T,
  );

  it(
    'is not reached by a light-only color, so that makes no problem there',
    async () => {
      await themeEditNew('n', {cwd, like: 'neutral'});
      const r = /** @type {any} */ (
        await themeEditSet('n', 'color', '#1e40af', {
          cwd,
          on: 'button',
          when: 'variant:secondary',
          mode: 'light',
        })
      ).data;
      expect(
        r.newProblems.filter((/** @type {any} */ p) =>
          / on lightbox /.test(p.problem),
        ),
      ).toEqual([]);
    },
    T,
  );

  it(
    'is listed once, with a fix in its scheme that ends the problems',
    async () => {
      await themeEditNew('g', {cwd, like: 'neutral'});
      await themeEditSet('g', 'color', '#333333', {
        cwd,
        on: 'button',
        when: 'variant:secondary',
      });
      const first = await open('g');
      const media = first.filter(p => / on lightbox /.test(p.problem));
      expect(media.length).toBeLessThanOrEqual(1);
      let left = first;
      for (let i = 0; i < 8 && left.some(p => p.fix); i++) {
        await follow(/** @type {string} */ (left.find(p => p.fix)?.fix));
        left = await open('g');
      }
      expect(left).toEqual([]);
    },
    T,
  );

  it(
    'offers no line when the page needs the other color, so fixes never cycle',
    async () => {
      await themeEditNew('o', {cwd, like: 'neutral'});
      await themeEditSet('o', '--color-overlay', 'rgba(255,255,255,0.9)', {
        cwd,
      });
      const media = (await open('o')).filter(p =>
        / on lightbox /.test(p.problem),
      );
      expect(media.length).toBeGreaterThan(0);
      for (const p of media) expect(p.fix).toBeNull();
    },
    T,
  );
});
