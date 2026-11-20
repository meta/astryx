// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A missed part's line is one setting where one setting reaches it
 * (a toast's text picks its own side from its fill, so its surface alone
 * is the line); where it takes two (a tooltip's surface, then its text),
 * the problem the first step leaves says the next step clears it, and that
 * step does. A status fill's line on a media part (an error toast's red)
 * takes the text that reads on it where the part's own pick would not.
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
/** @type {Array<{part: string, line: string}>} */
let missed = [];
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-missed-step-lines-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  // A cream page in both modes: the inverted surfaces no longer stand out
  // in dark.
  await themeEditNew('t', {cwd, like: 'neutral'});
  await themeEditSet('t', '--color-background-body', '#fbf5ea', {cwd});
  missed = /** @type {any} */ (
    await themeEditShow('t', {cwd, section: 'actions'})
  ).data.missed;
}, T);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/**
 * Run one command of a line; its JSON result.
 * @param {string} one
 * @returns {Promise<any>}
 */
async function run(one) {
  const args = splitCommand(one.slice(one.indexOf('experimental ')));
  const r = await runCli([.../** @type {string[]} */ (args), '--json'], {cwd});
  expect(r.status, `${one}\n${r.stderr}`).toBe(0);
  return JSON.parse(r.stdout).data;
}

describe('a missed line', () => {
  it('is one setting for a toast, whose text follows its fill', () => {
    const toast = missed.find(m => m.part === 'toast');
    expect(toast?.line).toBeTruthy();
    expect(toast?.line).not.toMatch(/ && /);
  });

  it(
    'of two steps says, after the first, that the next clears the problem it leaves, and it does',
    async () => {
      const tooltip = missed.find(m => m.part === 'tooltip');
      const [first, next] = String(tooltip?.line).split(' && ');
      expect(next).toBeTruthy();
      const r = await run(first);
      const p = r.newProblems.find((/** @type {any} */ x) =>
        /^text in tooltip\b/.test(x.problem),
      );
      expect(p?.problem).toMatch(
        /this was the first step of the line offered for tooltip, and its next step clears it: .* set t /,
      );
      const after = await run(next);
      expect(
        /** @type {string[]} */ (after.problems).filter(x =>
          /^text in tooltip\b/.test(x),
        ),
      ).toEqual([]);
    },
    T,
  );

  it(
    'is not needed for a status fill on a media part the status color reaches, and that makes no problem',
    async () => {
      // The danger color reaches the error toast's fill itself; the toast's
      // text takes the readable side of its media surface.
      const r = await run(
        "astryx experimental theme editor set t danger '#dc2626'",
      );
      const now =
        /** @type {Array<{part: string, why: string, line: string}>} */ (
          /** @type {any} */ (
            await themeEditShow('t', {cwd, section: 'actions'})
          ).data.missed
        );
      expect(
        now.filter(m => m.part === 'toast' && /error color/.test(m.why)),
      ).toEqual([]);
      expect(r.problems.filter(x => /^text in toast\b/.test(x))).toEqual([]);
    },
    T,
  );
});
