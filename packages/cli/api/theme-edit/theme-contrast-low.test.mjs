// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Fix lines that fix the problem at its source: a whole-theme text
 * color too faint in many places gets one line on that token (the nearest
 * color that reads on every ground it is too faint on), not one per part;
 * a pale status fill gets the nearest darker color that stands out from
 * the page; and a failure the base theme draws itself is said once, not
 * after every change.
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
  cwd = makeLinkedFixture('astryx-theme-contrast-low-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  // One theme for every case: each changes its own color.
  await themeEditNew('c', {cwd, like: 'neutral'});
}, T);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/**
 * Follow a line; the problems the theme has after it, as text.
 * @param {string} line
 * @returns {Promise<string[]>}
 */
async function follow(line) {
  const args = splitCommand(line.slice(line.indexOf('experimental ')));
  const r = await runCli([.../** @type {string[]} */ (args), '--json'], {cwd});
  expect(r.status, `${line}\n${r.stderr}`).toBe(0);
  return JSON.parse(r.stdout).data.problems ?? [];
}

describe('fix lines at the source', () => {
  it(
    'a pale status fill gets the nearest darker color, which ends the problem',
    async () => {
      const r = /** @type {any} */ (
        await themeEditSet('c', 'success', '#a7f3d0', {cwd})
      ).data;
      const p = r.newProblems.find((/** @type {any} */ x) =>
        /exact success stands out from the page/.test(x.problem),
      );
      expect(p?.fix).toMatch(/ set c success '#[0-9a-f]{6}'$/);
      const left = await follow(p.fix);
      expect(left.filter(x => /stands out from the page/.test(x))).toEqual([]);
    },
    T,
  );

  it(
    'a faint whole-theme secondary color gets one line per mode, which ends every problem it made',
    async () => {
      const r = /** @type {any} */ (
        await themeEditSet('c', '--color-text-secondary', '#9a9a9a', {cwd})
      ).data;
      const lines = [
        ...new Set(
          r.newProblems
            .filter((/** @type {any} */ x) => /#9a9a9a on /.test(x.problem))
            .map((/** @type {any} */ x) => x.fix),
        ),
      ];
      // (Text drawn from another token, a code comment's, keeps its own
      // line.)
      const own = lines.filter(l => / --color-text-secondary /.test(l));
      expect(own.length).toBeGreaterThan(0);
      expect(own.length).toBeLessThanOrEqual(2);
      for (const l of own)
        expect(l).toMatch(
          / set c --color-text-secondary '#[0-9a-f]{6}'( --mode \w+)?$/,
        );
      /** @type {string[]} */
      let left = [];
      for (const l of lines) left = await follow(/** @type {string} */ (l));
      expect(left.filter(x => /#9a9a9a on /.test(x))).toEqual([]);
    },
    T,
  );

  it(
    'a change says nothing of what the base theme already drew',
    async () => {
      const r = /** @type {any} */ (
        await themeEditSet('c', 'corners', 'round', {cwd})
      ).data;
      expect(
        /** @type {string[]} */ (r.notes ?? []).filter(n =>
          n.startsWith("the base theme's "),
        ),
      ).toEqual([]);
    },
    T,
  );
});
