// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file What a change leaves unchecked or unreached is named: a part's
 * text color for a state is measured on the fill it draws in that state;
 * a color the base theme writes as its own accent (butter's blue links) is
 * listed under missed once the accent moves; and a fill made from a status
 * token the theme's status color does not reach (an error toast's red) is
 * listed once that status color is set. Each line, followed, ends it.
 */

import fs from 'node:fs';
import path from 'node:path';
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
// (Show's open problems and missed list come from the theme, not from the
// sheet it writes: one small section of the sheet is drawn, not all of it.)
const looked = () => ({cwd, section: 'actions'});
/** @type {string} */
let unbuilt = '';
beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-change-leaves-unchecked-unreached-',
    FIXTURE_PACKAGES,
  );
  writeFixtureBaseTheme(cwd, 'neutral');
  unbuilt = await installRealBaseThemes(cwd, ['neutral', 'butter']);
}, T);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/**
 * Follow a line (each command of it); the problems the theme has after it,
 * as text.
 * @param {string} line
 * @returns {Promise<string[]>}
 */
async function follow(line) {
  /** @type {string[]} */
  let problems = [];
  for (const one of line.split(' && ')) {
    const args = splitCommand(one.slice(one.indexOf('experimental ')));
    const r = await runCli([.../** @type {string[]} */ (args), '--json'], {
      cwd,
    });
    expect(r.status, `${one}\n${r.stderr}`).toBe(0);
    problems = JSON.parse(r.stdout).data.problems ?? [];
  }
  return problems;
}
/** @param {string} slug */
const shown = async slug =>
  /** @type {any} */ (await themeEditShow(slug, looked())).data;

describe('a text color for a state', () => {
  it(
    'is measured on the fill drawn in that state, and its line ends it',
    async () => {
      await themeEditNew('s', {cwd, like: 'neutral'});
      const r = /** @type {any} */ (
        await themeEditSet('s', 'color', '#ffd700', {
          cwd,
          on: 'top-nav-item',
          state: 'selected',
        })
      ).data;
      const p = r.newProblems.find((/** @type {any} */ x) =>
        /text in top-nav-item \(selected\)/.test(x.problem),
      );
      expect(p?.fix).toMatch(/--on top-nav-item --state selected/);
      const named = (/** @type {string} */ x) =>
        /top-nav-item \(selected\)/.test(x);
      let left = (await follow(p.fix)).filter(named);
      for (let i = 0; i < 3 && left.length; i++) {
        const next = (await shown('s')).openProblems.find(
          (/** @type {any} */ x) => named(x.problem),
        );
        left = (await follow(next.fix)).filter(named);
      }
      expect(left).toEqual([]);
    },
    T,
  );
});

describe("the base theme's own accent, written as a color", () => {
  it(
    'is reached by the accent once it moves, so it is not listed',
    async () => {
      if (unbuilt) return;
      await themeEditNew('b', {
        cwd,
        like: 'butter',
        settings: {accent: '#ff4fa3'},
      });
      const own = (/** @type {any} */ d) =>
        (d.missed ?? []).filter((/** @type {any} */ x) =>
          /base theme's own accent/.test(x.why),
        );
      expect(own(await shown('b'))).toEqual([]);
      expect(
        fs.readFileSync(path.join(cwd, 'themes', 'b', 'b.css'), 'utf8'),
      ).toMatch(/var\(--color-text-accent\)/);
    },
    T,
  );
});

describe('a status fill the status color reaches', () => {
  it(
    'the error toast follows the danger color: no miss for it',
    async () => {
      await themeEditNew('e', {
        cwd,
        like: 'neutral',
        settings: {danger: '#7a2530'},
      });
      const miss = (/** @type {any} */ d) =>
        (d.missed ?? []).find(
          (/** @type {any} */ x) =>
            x.part === 'toast' && /does not reach/.test(x.why),
        );
      expect(miss(await shown('e'))).toBeUndefined();
      expect(fs.readFileSync(path.join(cwd, 'themes/e/e.css'), 'utf8')).toMatch(
        /--color-background-error-inverted: light-dark\(#[0-9a-f]{6}, #[0-9a-f]{6}\)/,
      );
    },
    T,
  );
});
