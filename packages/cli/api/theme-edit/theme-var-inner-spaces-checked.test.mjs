// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A color written as a token reference with spaces inside
 * (`var( --color-background-body )`) is checked as the same reference with
 * none: its text contrast problems are said.
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

const T = 300_000;
/** @type {string} */
let cwd;
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-var-inner-spaces-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('a', {cwd, like: 'neutral'});
  await themeEditNew('b', {cwd, like: 'neutral'});
}, T);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {any} r */
const textProblems = r =>
  /** @type {Array<{problem: string}>} */ (r.data.newProblems)
    .map(p => p.problem)
    .filter(p => /^text in button /.test(p));

describe('a token reference with spaces inside', () => {
  it(
    'is checked as the same reference without them',
    async () => {
      const spaced = await themeEditSet(
        'a',
        'color',
        'var( --color-background-body )',
        {
          cwd,
          on: 'button',
        },
      );
      const plain = await themeEditSet(
        'b',
        'color',
        'var(--color-background-body)',
        {
          cwd,
          on: 'button',
        },
      );
      expect(textProblems(plain).length).toBeGreaterThan(0);
      expect(textProblems(spaced).length).toBe(textProblems(plain).length);
    },
    T,
  );
});
