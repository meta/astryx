// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file show --png notes text its pictures draw too faint to read that no
 * contrast check measures (an overlay drawn open, a state, a variant the
 * checks do not draw), with the part, ratio, colors and picture; the
 * theme's disabled and placeholder text and text over media are left out.
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditShow} from './theme-edit.mjs';
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

// (These cases read drawn pictures: drawn for real.)
realRenders(true);

const T = 600_000;
/** @type {string} */
let cwd;
let unbuilt = '';
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-drawn-contrast-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  unbuilt = await installRealBaseThemes(cwd, ['gothic']);
  if (!unbuilt) await themeEditNew('g', {cwd, like: 'gothic'});
}, T);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('text the pictures draw too faint to read', () => {
  it(
    'a menu drawn open with unreadable text is noted, with its picture',
    async () => {
      if (unbuilt) return;
      const r = /** @type {any} */ (await themeEditShow('g', {cwd, png: true}))
        .data;
      if (!r.pictures?.length) return; // (no browser here)
      const notes = /** @type {string[]} */ (r.notes).filter(n =>
        n.startsWith('the pictures draw text in '),
      );
      expect(
        notes.some(n =>
          /^the pictures draw text in side-nav-item \("Inbox"\) at 1\.\d+:1 in light \(#000000 on #[0-9a-f]{6}, in themes\/g\/sheet-overlays\.png\), which no check above measures; text needs 4\.5:1; what draws it: .* how side-nav-item$/.test(
            n,
          ),
        ),
      ).toBe(true);
    },
    T,
  );
});
