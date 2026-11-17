// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Lines for fills over a part's states and status variants: white
 * text set on a highlighted row over its see-through tint gets the line
 * that makes the highlight a solid fill it reads on (with the row's own
 * label text), not a line turning the text dark; and a fill set on a toast
 * says the scoped line for each type it covers.
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
  cwd = makeLinkedFixture(
    'astryx-theme-state-status-fill-lines-',
    FIXTURE_PACKAGES,
  );
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
  await themeEditSet('t', 'accent', '#2563eb', {cwd});
}, T);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} line */
async function follow(line) {
  for (const one of line.split(' && ')) {
    const r = await runCli(
      /** @type {string[]} */ (
        splitCommand(one.slice(one.indexOf('experimental ')))
      ),
      {cwd},
    );
    expect(r.status, r.stderr).toBe(0);
  }
}

describe('lines for state and status fills', () => {
  it(
    'white highlight text gets a solid highlight fill line, and following it clears the problem',
    async () => {
      const r = /** @type {any} */ (
        await themeEditSet('t', 'color', '#ffffff', {
          cwd,
          on: 'typeahead-option',
          state: 'highlighted',
          mode: 'light',
        })
      ).data;
      const p = /** @type {Array<{problem: string, fix: string | null}>} */ (
        r.newProblems
      ).find(x => /^text in typeahead-option \(highlighted\)/.test(x.problem));
      expect(p?.fix).toMatch(
        / set t background-color '#[0-9a-f]{6}' --on typeahead-option --state highlighted --mode light( && |$)/,
      );
      expect(p?.fix).not.toMatch(/ color '#[0-9a-f]{6}' --on typeahead-option/);
      await follow(/** @type {string} */ (p?.fix));
      const shown = /** @type {any} */ (await themeEditShow('t', {cwd})).data;
      expect(
        /** @type {Array<{problem: string}>} */ (shown.openProblems).filter(x =>
          /typeahead/.test(x.problem),
        ),
      ).toEqual([]);
    },
    T,
  );

  it(
    'a fill on a toast says the scoped line for each type it covers',
    async () => {
      const r = /** @type {any} */ (
        await themeEditSet('t', 'background-color', '#ffffff', {
          cwd,
          on: 'toast',
        })
      ).data;
      const note = /** @type {string[]} */ (r.notes).find(n =>
        /toast's fill now covers/.test(n),
      );
      expect(note).toMatch(/--on toast --when type:info/);
      expect(note).toMatch(/--on toast --when type:error/);
    },
    T,
  );
});
