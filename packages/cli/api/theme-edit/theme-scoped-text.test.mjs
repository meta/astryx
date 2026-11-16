// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A change limited to one state or condition (a selected row's fill,
 * an info banner's fill) is contrast-checked like any other: the part's
 * text measured on its fill there, in each mode, with the nearest readable
 * color as its line, set on what draws the text in that state or
 * condition. Following the line ends the problem.
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
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
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-scoped-text-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  // One theme for every case: each changes its own part.
  await themeEditNew('b', {cwd, like: 'neutral'});
}, T);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/**
 * Follow a line; the problems the theme has after it (every one, as text).
 * @param {string} line
 * @returns {Promise<string[]>}
 */
async function follow(line) {
  const args = splitCommand(line.slice(line.indexOf('experimental ')));
  const r = await runCli([.../** @type {string[]} */ (args), '--json'], {cwd});
  expect(r.status, `${line}\n${r.stderr}`).toBe(0);
  return JSON.parse(r.stdout).data.problems;
}

describe('a change for one condition', () => {
  it(
    "a pale info banner fill is checked in dark, fixed on the banner's text token there",
    async () => {
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
      const left = await follow(p.fix);
      expect(
        left.filter(x => /text in banner \(status info\)/.test(x)),
      ).toEqual([]);
    },
    T,
  );
});

describe('a change for one state', () => {
  it(
    'a pale selected-row fill is checked in dark, fixed in that state',
    async () => {
      // (On the theme the condition's case made: another part, another
      // scope.)
      const r = /** @type {any} */ (
        await themeEditSet('b', '--color-accent-muted', '#dbeafe', {
          cwd,
          on: 'table-row',
          state: 'selected',
        })
      ).data;
      const p = r.newProblems.find((/** @type {any} */ x) =>
        /text in table-row \(selected\).* in dark/.test(x.problem),
      );
      expect(p?.fix).toMatch(/--on table-row --state selected --mode dark$/);
      const left = await follow(p.fix);
      expect(
        left.filter(x => /text in table-row \(selected\)/.test(x)),
      ).toEqual([]);
    },
    T,
  );
});
