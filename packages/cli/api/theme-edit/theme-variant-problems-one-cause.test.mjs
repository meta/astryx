// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The same text in the same color failing on three or more of its
 * ground's variants (an accent link in every colored card) is one problem
 * for each mode, with each variant's line in one; following it clears them.
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
  cwd = makeLinkedFixture('astryx-theme-variant-problems-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  unbuilt = await installRealBaseThemes(cwd, ['gothic']);
  if (!unbuilt) await themeEditNew('g', {cwd, like: 'gothic'});
}, T);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('one cause across a ground part variants', () => {
  it('is one problem for each mode, and its line clears it', async () => {
    if (unbuilt) return;
    const r = /** @type {any} */ (
      await themeEditSet('g', 'accent', '#2563eb', {cwd})
    ).data;
    const across = /** @type {Array<{problem: string, fix: string}>} */ (
      r.newProblems
    ).filter(p =>
      /^text \(".*"\) in \S+ on \d+ card variants /.test(p.problem),
    );
    expect(
      across.map(p => / in (light|dark) /.exec(p.problem)?.[1]).sort(),
    ).toEqual(['dark', 'light']);
    expect(
      /** @type {Array<{problem: string}>} */ (r.newProblems).filter(p =>
        /\(on card, variant \w+\)/.test(p.problem),
      ),
    ).toEqual([]);
    for (const p of across)
      for (const one of p.fix.split(' && ')) {
        const run = await runCli(
          /** @type {string[]} */ (
            splitCommand(one.slice(one.indexOf('experimental ')))
          ),
          {cwd},
        );
        expect(run.status, run.stderr).toBe(0);
      }
    const shown = /** @type {any} */ (await themeEditShow('g', {cwd})).data;
    expect(
      /** @type {Array<{problem: string}>} */ (shown.openProblems).filter(p =>
        /card variants|variant \w+\)/.test(p.problem),
      ),
    ).toEqual([]);
  }, 600_000);
});
