// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A padding of two to four lengths on a part whose Core box reads its
 * padding inside calc() (a menu, a segmented control) is refused, since one
 * length is all that works there, and the refusal offers the sides as CSS
 * gives them out, each with the length typed for it: `5px 0` is
 * padding-block 5px and padding-inline 0. Each line it offers runs.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

const T = 240_000;

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-calc-padding-sides-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** The lines a refusal offers, without the command prefix. @param {string} v */
const offered = async v =>
  (
    await refusal(() =>
      themeEditSet('t', 'padding', v, {cwd, on: 'dropdown-menu'}),
    )
  ).run.map((/** @type {string} */ x) => x.replace(/^.* editor set t /, ''));

describe('a padding of several lengths where only one works', () => {
  it(
    'offers the sides, each with the length typed for it',
    async () => {
      expect(await offered('5px 0')).toEqual([
        'padding-block 5px --on dropdown-menu',
        'padding-inline 0 --on dropdown-menu',
      ]);
      expect(await offered('2px 15px 3px')).toEqual([
        'padding-top 2px --on dropdown-menu',
        'padding-inline 15px --on dropdown-menu',
        'padding-bottom 3px --on dropdown-menu',
      ]);
      expect(await offered('1px 2px 3px 4px')).toEqual([
        'padding-top 1px --on dropdown-menu',
        'padding-right 2px --on dropdown-menu',
        'padding-bottom 3px --on dropdown-menu',
        'padding-left 4px --on dropdown-menu',
      ]);
    },
    T,
  );

  it(
    'offers the one length when each side says the same',
    async () => {
      expect(await offered('5px 5px')).toEqual([
        'padding 5px --on dropdown-menu',
      ]);
    },
    T,
  );

  it(
    'offers lines that run',
    async () => {
      await themeEditSet('t', 'padding-block', '5px', {
        cwd,
        on: 'dropdown-menu',
      });
      await themeEditSet('t', 'padding-inline', '0', {
        cwd,
        on: 'dropdown-menu',
      });
    },
    T,
  );
});
