// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A word the sample page's pictures draw broken across two lines
 * inside it (a table cell too narrow for the word at a larger text size)
 * is measured in the page by the browser that takes the picture and named
 * in set's result, as text cut short is: a note, and a problem. (A fresh
 * theme's pictures name none: the cut-short test checks that.)
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
import {realRenders} from '../../test-utils/theme-render-stub.mjs';

// (These cases read the drawn pages, their pictures or what a drawing
// reports: drawn for real.)
realRenders(true);

const T = 300_000;
/** @type {string} */
let cwd;
/** Why butter could not be installed here, or ''. */
let unbuilt = '';
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-broken-words-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  unbuilt = await installRealBaseThemes(cwd, ['butter']);
}, T);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('words the pictures break inside the word', () => {
  it(
    'a larger text size that breaks a table word is a note and a problem',
    async () => {
      if (unbuilt) return;
      await themeEditNew('b', {cwd, like: 'butter'});
      const r = /** @type {any} */ (
        await themeEditSet('b', 'text-size', '24', {cwd, png: true})
      ).data;
      expect(r.pictures).toContain('themes/b/preview.png');
      const p = r.newProblems.find((/** @type {any} */ x) =>
        /^words broken across lines inside the word/.test(x.problem),
      );
      expect(p?.problem).toMatch(/"[^"]{3,}"/);
      expect(
        /** @type {string[]} */ (r.notes).some(n =>
          /breaks \d+ words? across lines inside the word/.test(n),
        ),
      ).toBe(true);
    },
    T,
  );
});
