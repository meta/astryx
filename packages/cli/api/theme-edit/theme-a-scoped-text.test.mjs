// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A change limited to one state or condition (a selected row's fill,
 * an info banner's fill) is contrast-checked like any other: the part's
 * text measured on its fill there, in each mode, with the nearest readable
 * color as its line, set on what draws the text in that state or
 * condition. Following the line ends the problem.
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

const T = 400_000;
/** @type {string} */
let cwd;
beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-a-scoped-text-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
});
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} line */
async function follow(line) {
  const args = splitCommand(line.slice(line.indexOf('experimental ')));
  const r = await runCli(/** @type {string[]} */ (args), {cwd});
  expect(r.status, `${line}\n${r.stderr}`).toBe(0);
}
/** @param {string} slug @param {RegExp} re */
const open = async (slug, re) =>
  /** @type {Array<{problem: string, fix: string | null}>} */ (
    /** @type {any} */ (await themeEditShow(slug, {cwd})).data.openProblems
  ).filter(p => re.test(p.problem));

describe('a change for one condition', () => {
  it(
    "a pale info banner fill is checked in dark, fixed on the banner's text token there",
    async () => {
      await themeEditNew('b', {cwd, like: 'neutral'});
      const r = /** @type {any} */ (
        await themeEditSet('b', 'background-color', '#f3f4f6', {
          cwd,
          on: 'banner',
          when: 'status:info',
        })
      ).data;
      expect(JSON.stringify(r.notes ?? [])).not.toMatch(
        /not checked: text contrast/,
      );
      const p = r.newProblems.find((/** @type {any} */ x) =>
        /text in banner \(status info\).* in dark/.test(x.problem),
      );
      expect(p?.fix).toMatch(
        /--color-on-info-muted '#[0-9a-f]{6}' --on banner --when status:info --mode dark$/,
      );
      await follow(p.fix);
      expect(await open('b', /text in banner \(status info\)/)).toEqual([]);
    },
    T,
  );
});

describe('a change for one state', () => {
  it(
    'a pale selected-row fill is checked in dark, fixed in that state',
    async () => {
      await themeEditNew('r', {cwd, like: 'neutral'});
      const r = /** @type {any} */ (
        await themeEditSet('r', '--color-accent-muted', '#dbeafe', {
          cwd,
          on: 'table-row',
          state: 'selected',
        })
      ).data;
      const p = r.newProblems.find((/** @type {any} */ x) =>
        /text in table-row \(selected\).* in dark/.test(x.problem),
      );
      expect(p?.fix).toMatch(/--on table-row --state selected --mode dark$/);
      await follow(p.fix);
      expect(await open('r', /text in table-row \(selected\)/)).toEqual([]);
    },
    T,
  );
});
