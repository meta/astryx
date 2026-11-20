// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A part with no fill of its own whose color is set (a checkbox's
 * check) is measured on the fill of the part it sits in, in the state it
 * shows in (the box, checked): a black check on a white checked box is no
 * problem, a white one is, and its line keeps the check visible and is one
 * set takes (no state the check does not have).
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
    'astryx-theme-part-text-on-holder-',
    FIXTURE_PACKAGES,
  );
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
  // Checked boxes white in dark, as `how` offers it.
  await themeEditSet('t', 'background-color', '#ffffff', {
    cwd,
    on: 'checkbox-indicator',
    state: 'checked',
    mode: 'dark',
    only: true,
  });
}, T);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {any} r */
const checkProblems = r =>
  /** @type {Array<{problem: string, fix: string | null}>} */ (
    r.data.newProblems
  ).filter(p => /^text in checkbox-indicator-check\b/.test(p.problem));

describe("a checkbox's check", () => {
  it(
    'in black on the white checked box is no problem',
    async () => {
      const r = await themeEditSet('t', 'color', '#000000', {
        cwd,
        on: 'checkbox-indicator-check',
        mode: 'dark',
      });
      expect(checkProblems(r)).toEqual([]);
    },
    T,
  );

  it(
    'in white on the white checked box is a problem, measured on the box, whose line keeps it visible',
    async () => {
      const r = await themeEditSet('t', 'color', '#ffffff', {
        cwd,
        on: 'checkbox-indicator-check',
        mode: 'dark',
      });
      const [p] = checkProblems(r);
      expect(p.problem).toMatch(/on checkbox-indicator's #ffffff/);
      expect(p.fix).toMatch(
        / color '#[0-9a-f]{6}' --on checkbox-indicator-check --mode dark$/,
      );
      expect(p.fix).not.toMatch(/'#ffffff'|--state/);
      const line = /** @type {string} */ (p.fix);
      const run = await runCli(
        [
          .../** @type {string[]} */ (
            splitCommand(line.slice(line.indexOf('experimental ')))
          ),
          '--json',
        ],
        {cwd},
      );
      expect(run.status, run.stderr).toBe(0);
      expect(
        /** @type {string[]} */ (JSON.parse(run.stdout).data.problems).filter(
          x => /^text in checkbox-indicator-check\b/.test(x),
        ),
      ).toEqual([]);
    },
    T,
  );
});
