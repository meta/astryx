// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A progress bar's fill that does not read on its track gets a line
 * for the variant measured (the accent bar), so the status bars keep their
 * own colors, and once the lines are followed the problem clears.
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {loadTheme} from './_settings.mjs';
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
  cwd = makeLinkedFixture(
    'astryx-theme-track-fill-own-variant-',
    FIXTURE_PACKAGES,
  );
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
}, T);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {Array<{problem?: string, text?: string}>} list */
const onTrack = list =>
  list.filter(p =>
    /progress-bar-fill .* on the progress-bar-track/.test(
      String(p.problem ?? p),
    ),
  );

describe('a progress fill that does not read on its track', () => {
  it(
    'gets a line for the accent bar alone, and following it clears the problem',
    async () => {
      const r = /** @type {any} */ (
        await themeEditSet('t', 'accent', '#ea580c', {cwd})
      );
      const found = onTrack(r.data.newProblems);
      expect(found.length).toBeGreaterThan(0);
      for (const p of /** @type {any[]} */ (found)) {
        expect(p.fix).toMatch(
          / background-color '#[0-9a-f]{6}' --on progress-bar-fill --when variant:accent --mode (light|dark)$/,
        );
        const line = /** @type {string} */ (p.fix);
        const run = await runCli(
          /** @type {string[]} */ (
            splitCommand(line.slice(line.indexOf('experimental ')))
          ),
          {cwd},
        );
        expect(run.status, run.stderr).toBe(0);
      }
      // No fill for every variant: the status bars keep their colors.
      expect(
        loadTheme(cwd, 't').settings.filter(
          x => x.on === 'progress-bar-fill' && !x.when,
        ),
      ).toEqual([]);
      const shown = /** @type {any} */ (await themeEditShow('t', {cwd}));
      expect(onTrack(shown.data.openProblems)).toEqual([]);
    },
    T,
  );
});
