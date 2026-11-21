// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A change that moves a problem without clearing it (a darker accent,
 * still too faint on the progress track) makes no new problem, but says it
 * apart as still failing, with what it was and its fix.
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-moved-problem-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
  await themeEditSet('t', 'accent', '#c4b5fd', {cwd});
}, T);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('a problem a change moves but does not clear', () => {
  it(
    'is said apart, with what it was and its fix',
    async () => {
      const r = /** @type {any} */ (
        await themeEditSet('t', 'accent', '#8f84b9', {cwd})
      ).data;
      const left = /** @type {Array<{problem: string, fix: string | null}>} */ (
        r.leftProblems ?? []
      );
      const light = left.filter(p =>
        /^the progress-bar-fill \(#8f84b9\) is [\d.]+:1 on the progress-bar-track .* in light; .* \(it was [\d.]+:1 before this change\)$/.test(
          p.problem,
        ),
      );
      expect(light).toHaveLength(1);
      expect(light[0].fix).toMatch(
        / --on progress-bar-fill --when variant:accent --mode light$/,
      );
      expect(
        /** @type {Array<{problem: string}>} */ (r.newProblems).filter(
          p =>
            /in light/.test(p.problem) && /progress-bar-track/.test(p.problem),
        ),
      ).toEqual([]);
      await themeEditSet('t', 'accent', '#c4b5fd', {cwd});
      const text = await runCli(
        ['experimental', 'theme', 'editor', 'set', 't', 'accent', '#8f84b9'],
        {cwd},
      );
      expect(text.stdout).toMatch(
        /^still failing after this change \(\d+\):$/m,
      );
    },
    T,
  );
});
