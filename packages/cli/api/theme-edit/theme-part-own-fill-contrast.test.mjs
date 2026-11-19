// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A fill set on a part the base draws with none (every tab painted
 * gray) is what its text sits on: the text in each state is measured on
 * it, named on that part, and each line sets the text on that part, so
 * following them ends the problems.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
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

// (What these cases check comes from the theme, not the rendered pages: the
// renders are stood in for.)
vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

const T = 400_000;
/** @type {string} */
let cwd;
beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-part-own-fill-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
});
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} slug */
const tabProblems = async slug =>
  /** @type {Array<{problem: string, fix: string | null}>} */ (
    /** @type {any} */ (await themeEditShow(slug, {cwd, section: 'actions'}))
      .data.openProblems
  ).filter(p => /^text in tab\b/.test(p.problem));

describe('a fill on a part the base leaves unfilled', () => {
  it(
    'is what its text is measured on, in every state, and the lines on that part end it',
    async () => {
      await themeEditNew('t', {cwd, like: 'neutral'});
      await themeEditSet('t', 'color', '#0d6efd', {
        cwd,
        on: 'tab',
        state: 'selected',
      });
      await themeEditSet('t', 'background-color', '#6c757d', {cwd, on: 'tab'});
      let left = await tabProblems('t');
      // The selected tab's text on the gray, and the other tabs' text on it.
      expect(
        left.some(p =>
          /^text in tab \(selected\).*on tab's #6c757d/.test(p.problem),
        ),
      ).toBe(true);
      expect(
        left.some(p =>
          /^text in tab \("[^"]+"\).*on tab's #6c757d/.test(p.problem),
        ),
      ).toBe(true);
      for (const p of left.filter(x => x.fix))
        expect(p.fix).toMatch(/ --on tab\b/);
      for (let i = 0; i < 8 && left.some(p => p.fix); i++) {
        const fix = /** @type {string} */ (left.find(p => p.fix)?.fix);
        const r = await runCli(
          /** @type {string[]} */ (
            splitCommand(fix.slice(fix.indexOf('experimental ')))
          ),
          {cwd},
        );
        expect(r.status, `${fix}\n${r.stderr}`).toBe(0);
        left = await tabProblems('t');
      }
      expect(left).toEqual([]);
    },
    T,
  );
});
