// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A fill set on a part whose own sub-part keeps a resting fill of its
 * own (a code block's header) says the part now shows two tones, with the
 * line that gives the sub-part the same fill; that line is one set takes,
 * and once it is set the note is gone.
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
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

const T = 300_000;
/** @type {string} */
let cwd;
let unbuilt = '';
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-fill-two-tones-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  // (The real neutral: its code block colors are what the header keeps.)
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (!unbuilt) await themeEditNew('t', {cwd, like: 'neutral'});
}, T);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

const TWO =
  /^code-block-header inside code-block keeps its own fill .* two tones; to give it the same fill: .* set t background-color '#f6f6f6' --on code-block-header --mode light$/;

describe('a fill on a part with a sub-part of its own fill', () => {
  it(
    'says the two tones, with the line that matches the sub-part',
    async () => {
      const r = /** @type {any} */ (
        await themeEditSet('t', 'background-color', '#f6f6f6', {
          cwd,
          on: 'code-block',
          mode: 'light',
        })
      ).data;
      const note = /** @type {string[]} */ (r.notes).find(n => TWO.test(n));
      expect(note).toBeDefined();
      const line = /** @type {string} */ (note).slice(
        /** @type {string} */ (note).indexOf('experimental '),
      );
      const run = await runCli(/** @type {string[]} */ (splitCommand(line)), {
        cwd,
      });
      expect(run.status, run.stderr).toBe(0);
      const again = /** @type {any} */ (
        await themeEditSet('t', 'background-color', '#f6f6f6', {
          cwd,
          on: 'code-block',
          mode: 'light',
        })
      ).data;
      expect(
        /** @type {string[]} */ (again.notes).filter(n => /two tones/.test(n)),
      ).toEqual([]);
    },
    T,
  );
});
