// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A new theme's color flags are checked as setting those dials is:
 * a pale accent that does not stand out from the page is named in `new`'s
 * problems, in the words `set accent` uses.
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew} from './theme-edit.mjs';
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
beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-new-color-warnings-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
});
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe("new's color flags", () => {
  it(
    'name a pale accent that does not stand out from the page, as set does',
    async () => {
      const made = /** @type {any} */ (
        await themeEditNew('p', {
          cwd,
          like: 'neutral',
          settings: {accent: '#f4a7c0'},
        })
      ).data;
      const pale = /** @type {string[]} */ (made.problems).filter(x =>
        /your exact accent stands out from the page at only/.test(x),
      );
      expect(pale.length).toBe(1);
    },
    T,
  );
});
