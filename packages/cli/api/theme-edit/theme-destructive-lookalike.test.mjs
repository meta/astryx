// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A destructive button a person cannot tell from the primary one
 * (a pastel pink accent beside the soft salmon destructive fill) is a note,
 * not a problem, with the line that draws it in the theme's danger color;
 * following it ends the note. Butter, and a theme whose accent stands
 * apart, get none.
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditShow} from './theme-edit.mjs';
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

const T = 400_000;
/** @type {string} */
let cwd;
/** Why the real bases could not be installed here, or ''. */
let unbuilt = '';
beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-destructive-lookalike-',
    FIXTURE_PACKAGES,
  );
  writeFixtureBaseTheme(cwd, 'neutral');
  unbuilt = await installRealBaseThemes(cwd, ['neutral', 'butter']);
}, T);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} slug */
const looked = async slug => {
  const d = /** @type {any} */ (
    await themeEditShow(slug, {cwd, section: 'actions'})
  ).data;
  return {
    notes: /** @type {string[]} */ (d.notes ?? []).filter(n =>
      /^the destructive button .* looks like the primary button/.test(n),
    ),
    problems: /** @type {Array<{problem: string}>} */ (d.openProblems).filter(
      p => /destructive button .* looks like/.test(p.problem),
    ),
  };
};

describe('a destructive button like the primary one', () => {
  it(
    'on a pastel pink theme is a note with the line that draws it in the danger color, which ends it',
    async () => {
      if (unbuilt) return;
      await themeEditNew('p', {
        cwd,
        like: 'neutral',
        settings: {accent: '#f4a7c0'},
      });
      const first = await looked('p');
      expect(first.problems).toEqual([]);
      expect(first.notes.length).toBe(1);
      const line = first.notes[0].split("the theme's danger color: ")[1];
      expect(line).toMatch(
        /background-color 'var\(--color-error\)' --on button --when variant:destructive/,
      );
      for (const one of line.split(' && ')) {
        const r = await runCli(
          /** @type {string[]} */ (
            splitCommand(one.slice(one.indexOf('experimental ')))
          ),
          {cwd},
        );
        expect(r.status, `${one}\n${r.stderr}`).toBe(0);
      }
      expect((await looked('p')).notes).toEqual([]);
    },
    T,
  );

  it(
    'is not said on butter, or where the accent stands apart',
    async () => {
      if (unbuilt) return;
      await themeEditNew('b', {cwd, like: 'butter'});
      expect((await looked('b')).notes).toEqual([]);
      await themeEditNew('n', {
        cwd,
        like: 'neutral',
        settings: {accent: '#2563eb'},
      });
      expect((await looked('n')).notes).toEqual([]);
    },
    T,
  );
});
