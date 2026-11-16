// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A fill set for a state is measured against the text that state
 * draws, in its own variant: a part that draws no text (a switch's track,
 * a tab's underline) has none to measure, and a primary button's hover
 * fill is measured against the primary button's own text, not another
 * variant's. A page change that leaves the loading placeholder as faint as
 * the base drew it makes no new problem of it.
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
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
/** Why the real neutral could not be installed here, or ''. */
let unbuilt = '';
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-state-fill-text-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  await themeEditNew('t', {cwd, like: 'neutral'});
}, T);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {any} r @param {RegExp} re */
const newOf = (r, re) =>
  r.data.newProblems.filter((/** @type {any} */ p) => re.test(p.problem));

describe('a state fill', () => {
  it(
    'on a part that draws no text makes no text problem',
    async () => {
      const sw = await themeEditSet(
        't',
        'background-color',
        'var(--color-accent)',
        {
          cwd,
          on: 'switch',
          state: 'checked',
        },
      );
      expect(newOf(sw, /^text in switch\b/)).toEqual([]);
      const tab = await themeEditSet('t', 'background-color', '#fd8c73', {
        cwd,
        on: 'tab-indicator',
        state: 'selected',
      });
      expect(newOf(tab, /^text in tab-indicator\b/)).toEqual([]);
    },
    T,
  );

  it(
    "for one variant is measured against that variant's own text",
    async () => {
      const r = /** @type {any} */ (
        await themeEditSet('t', 'background-color', '#0b5ed7', {
          cwd,
          on: 'button',
          when: 'variant:primary',
          state: 'hover',
          mode: 'light',
        })
      );
      // The primary button's text in light is white on the blue: it reads.
      expect(newOf(r, /^text in button\b/)).toEqual([]);
    },
    T,
  );
});

describe('the loading placeholder', () => {
  it(
    'as faint as the base drew it is no new problem after a page change',
    async () => {
      if (unbuilt) return;
      await themeEditNew('p', {cwd, like: 'neutral'});
      const r = await themeEditSet('p', '--color-background-body', '#f2f9ec', {
        cwd,
        mode: 'light',
      });
      expect(newOf(r, /loading placeholder/)).toEqual([]);
    },
    T,
  );
});
