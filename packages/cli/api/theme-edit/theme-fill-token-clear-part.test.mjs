// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A fill token set on a part Core also draws with no fill of its own
 * inside another part (main content in an app shell) says so, with the
 * property that paints the part itself, and that line is one set takes; a
 * part whose clear fill is a variant of its own (a transparent card) says
 * nothing of it.
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

const T = 300_000;
/** @type {string} */
let cwd;
beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-fill-token-clear-part-',
    FIXTURE_PACKAGES,
  );
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
}, T);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

const CLEAR = /is also drawn with no fill of its own inside another part/;

describe('a fill token on a part drawn clear inside another', () => {
  it(
    'main content says the token does not paint it in an app shell, with the line that does',
    async () => {
      const r = /** @type {any} */ (
        await themeEditSet('t', '--color-background-surface', '#fef3c7', {
          cwd,
          on: 'layout-content',
          mode: 'light',
        })
      ).data;
      const note = /** @type {string[]} */ (r.notes).find(n => CLEAR.test(n));
      expect(note).toMatch(
        / set t background-color '#fef3c7' --on layout-content --mode light$/,
      );
      const line = /** @type {string} */ (note).slice(
        /** @type {string} */ (note).indexOf('experimental '),
      );
      const run = await runCli(/** @type {string[]} */ (splitCommand(line)), {
        cwd,
      });
      expect(run.status, run.stderr).toBe(0);
    },
    T,
  );

  it(
    'a card, clear only as a variant of its own, says nothing of it',
    async () => {
      const r = /** @type {any} */ (
        await themeEditSet('t', '--color-background-card', '#fef3c7', {
          cwd,
          on: 'card',
          mode: 'light',
        })
      ).data;
      expect(
        /** @type {string[]} */ (r.notes).filter(n => CLEAR.test(n)),
      ).toEqual([]);
    },
    T,
  );
});
