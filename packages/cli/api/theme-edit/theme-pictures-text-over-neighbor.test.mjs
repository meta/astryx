// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Text a picture draws over the text beside it (a calendar's weekday
 * names wider than their columns at a larger text size and less spacing)
 * is measured in the page by the browser that takes the picture and named
 * in show's result, on a sheet too: a note, and an open problem.
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

const T = 300_000;
/** @type {string} */
let cwd;
/** Why neutral could not be installed here, or ''. */
let unbuilt = '';
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-text-over-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
}, T);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('text the pictures draw over the text beside it', () => {
  it(
    'calendar weekday names that run into each other are a note and a problem',
    async () => {
      if (unbuilt) return;
      await themeEditNew('h', {cwd, like: 'neutral'});
      await themeEditSet('h', 'mode', 'light-only', {cwd});
      await themeEditSet('h', 'text-size', '20', {cwd});
      await themeEditSet('h', 'spacing', 'less', {cwd});
      const r = /** @type {any} */ (
        await themeEditShow('h', {cwd, section: 'overlays', png: true})
      ).data;
      expect(r.pictures).toContain('themes/h/sheet-overlays.png');
      expect(
        /** @type {Array<{problem: string}>} */ (r.openProblems).some(p =>
          /^calendar labels drawn over the text beside them in the sheet's pictures/.test(
            p.problem,
          ),
        ),
      ).toBe(true);
      expect(
        /** @type {string[]} */ (r.notes).some(n =>
          /draws \d+ calendar labels? over the text beside/.test(n),
        ),
      ).toBe(true);
    },
    T,
  );

  it(
    'names each sheet that draws it, and names letters a fraction of a pixel over',
    async () => {
      if (unbuilt) return;
      const r = /** @type {any} */ (
        await themeEditShow('h', {cwd, section: 'inputs', png: true})
      ).data;
      // The inputs sheet's own pictures: a note of their own, beside the
      // open states' one.
      const note = /** @type {string[]} */ (r.notes).find(
        n =>
          /over the text beside/.test(n) &&
          /themes\/h\/sheet-inputs-1\.png/.test(n),
      );
      expect(note).toBeDefined();
      // "Tue" runs into "Mon" by about half a pixel.
      expect(note).toMatch(/"Tue"/);
    },
    T,
  );
});
