// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Colors the official theme leaves to Core follow the dials: the
 * danger color reaches the error toast's inverted fill, and the gray dial
 * reaches the slider track, each at the shade nearest Core's own. A pale
 * accent that does not read on a track the gray only tints gets a line
 * that moves the accent's fill, not the track, and following it clears it.
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

const T = 300_000;
/** @type {string} */
let cwd;
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-colors-reach-core-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
}, T);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {any} r @param {string} token */
const moved = (r, token) =>
  /** @type {string[]} */ (r.data.changedTokens).filter(c =>
    c.startsWith(`${token} `),
  );

describe('colors Core draws that the dials reach', () => {
  it(
    'the danger color reaches the error toast fill in each mode',
    async () => {
      const r = await themeEditSet('t', 'danger', '#c2185b', {cwd});
      expect(moved(r, '--color-background-error-inverted')).toHaveLength(2);
    },
    T,
  );

  it('the gray dial reaches the slider track, and a pale accent there gets a line on its own fill', async () => {
    await themeEditSet('t', 'accent', '#f08070', {cwd});
    const r = await themeEditSet('t', 'neutral', '#78716c', {cwd});
    expect(moved(r, '--color-track')).toHaveLength(2);
    const shown = /** @type {any} */ (await themeEditShow('t', {cwd})).data;
    const onTrack = /** @type {Array<{problem: string, fix: string}>} */ (
      shown.openProblems
    ).filter(p => /on the (slider|progress-bar)-track/.test(p.problem));
    expect(onTrack.length).toBeGreaterThan(0);
    for (const p of onTrack) {
      expect(p.fix).not.toMatch(/--on (slider|progress-bar)-track/);
      const run = await runCli(
        /** @type {string[]} */ (
          splitCommand(p.fix.slice(p.fix.indexOf('experimental ')))
        ),
        {cwd},
      );
      expect(run.status, run.stderr).toBe(0);
    }
    const after = /** @type {any} */ (await themeEditShow('t', {cwd})).data;
    expect(
      /** @type {Array<{problem: string}>} */ (after.openProblems).filter(p =>
        /-track/.test(p.problem),
      ),
    ).toEqual([]);
  }, 600_000);
});
