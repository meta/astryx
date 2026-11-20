// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A missed line that sets a status color gives one the status color's
 * own contrast check passes: following it after a vibrancy change brings no
 * new contrast problem.
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

const T = 300_000;
/** @type {string} */
let cwd;
let unbuilt = '';
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-missed-status-line-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) return;
  await themeEditNew('t', {cwd, like: 'neutral'});
  await themeEditSet('t', 'accent', '#419f14', {cwd});
  await themeEditSet('t', 'vibrancy', 'more', {cwd});
}, T);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe("a missed line's status colors", () => {
  it('pass their own contrast check when followed', async () => {
    if (unbuilt) return;
    const missed = /** @type {Array<{part: string, line: string}>} */ (
      /** @type {any} */ (await themeEditShow('t', {cwd})).data.missed ?? []
    );
    // (A theme whose status colors follow the vibrancy has no such line.)
    const lines = missed
      .map(m => m.line)
      .filter(l => / set t (info|success|warning|danger) '/.test(l));
    for (const one of lines.flatMap(l => l.split(' && '))) {
      const run = await runCli(
        [
          .../** @type {string[]} */ (
            splitCommand(one.slice(one.indexOf('experimental ')))
          ),
          '--json',
        ],
        {cwd},
      );
      expect(run.status, run.stderr).toBe(0);
      expect(
        /** @type {Array<{problem: string}>} */ (
          JSON.parse(run.stdout).data.newProblems
        ).filter(p => /stands out from the page/.test(p.problem)),
      ).toEqual([]);
    }
  }, 600_000);
});
