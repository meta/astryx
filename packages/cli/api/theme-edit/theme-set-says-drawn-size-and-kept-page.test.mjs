// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A dial step on a part says the size it drew there (a card's own
 * corner scale gives a step another size than the dial's help names), and
 * a gray that keeps a page color the theme sets offers no line setting it
 * again.
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
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
    'astryx-theme-set-says-drawn-size-',
    FIXTURE_PACKAGES,
  );
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
}, T);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('what a change says it did', () => {
  it(
    'a corners step on a card names the radius it drew',
    async () => {
      const r = await runCli(
        [
          'experimental',
          'theme',
          'editor',
          'set',
          't',
          'corners',
          'more',
          '--on',
          'card',
        ],
        {cwd},
      );
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout.split('\n')[0]).toMatch(
        /^\[ok\] t: corners = \w+ on card \(drawn as border-radius \d+px\)$/,
      );
    },
    T,
  );

  it(
    'a gray keeps the page color the theme sets, with no line to set it again',
    async () => {
      await themeEditSet('t', '--color-background-body', '#ffffff', {
        cwd,
        mode: 'light',
      });
      const r = /** @type {any} */ (
        await themeEditSet('t', 'neutral', '#78716c', {cwd})
      ).data;
      const page = /** @type {string[]} */ (r.notes).filter(n =>
        n.startsWith('the page background'),
      );
      expect(page).toEqual([
        'the page background keeps the color you set for it',
      ]);
    },
    T,
  );
});
