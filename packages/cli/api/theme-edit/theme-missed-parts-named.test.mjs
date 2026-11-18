// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file What the theme's own changes did not reach, reported where it
 * applies: a new theme's starting colors are checked as a change's are,
 * a change names the parts it missed, and a base square by design is not
 * told its shadows sit beside square corners. And one family's own sheet
 * starts with that family: its parts drawn open follow it.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
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
import {realRenders} from '../../test-utils/theme-render-stub.mjs';

// (These cases read the drawn pages, their pictures or what a drawing
// reports: drawn for real.)
realRenders(true);

const T = 400_000;
/** @type {string} */
let cwd;
/** @type {string} */
let unbuilt = '';
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-missed-parts-named-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  unbuilt = await installRealBaseThemes(cwd, ['butter', 'y2k']);
}, T);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('what the changes did not reach', () => {
  it(
    'a new theme with a color reports its misses as set does, naming the parts',
    async () => {
      if (unbuilt) return;
      const made = /** @type {any} */ (
        await themeEditNew('b', {
          cwd,
          like: 'butter',
          settings: {accent: '#0b5cff'},
        })
      ).data;
      expect(made.missed).toBeGreaterThan(0);
      expect(made.missedOn.length).toBe(made.missedParts);
      const set = /** @type {any} */ (
        await themeEditSet('b', 'accent', '#0b5cfe', {cwd})
      ).data;
      expect(set.missedOn).toEqual(made.missedOn);
      // The text names the first parts.
      const r = await runCli(
        ['experimental', 'theme', 'editor', 'set', 'b', 'accent', '#0b5cff'],
        {cwd},
      );
      expect(r.stdout).toMatch(
        new RegExp(
          `^missed: \\d+ misses? on \\d+ parts? the theme's changes did not reach \\(${made.missedOn[0]}`,
          'm',
        ),
      );
    },
    T,
  );

  it(
    'a base square by design is not told its shadows sit beside square corners',
    async () => {
      if (unbuilt) return;
      await themeEditNew('y', {
        cwd,
        like: 'y2k',
        settings: {accent: '#c2410c'},
      });
      const r = /** @type {any} */ (
        await themeEditSet('y', 'neutral', '#57534e', {cwd})
      ).data;
      const runs = await runCli(
        [
          'experimental',
          'theme',
          'editor',
          'show',
          'y',
          '--section',
          'actions',
          '--json',
        ],
        {cwd},
      );
      const missed = /** @type {Array<{why: string}>} */ (
        JSON.parse(runs.stdout).data.missed
      );
      expect(missed.filter(m => /square corners/.test(m.why))).toEqual([]);
      expect(r.missed ?? 0).toBe(missed.length);
    },
    T,
  );

  it(
    "one family's sheet starts with that family, its parts drawn open after it",
    async () => {
      if (unbuilt) return;
      await themeEditShow('b', {cwd, section: 'actions'});
      const html = fs.readFileSync(
        path.join(cwd, 'themes/b/sheet-actions.html'),
        'utf8',
      );
      const groups = [...html.matchAll(/\bcs-family-([a-z-]+)\b/g)].map(
        m => m[1],
      );
      expect(groups[0]).toBe('actions');
      expect(groups).not.toContain('overlays');
      expect(groups).toContain('actions-open');
    },
    T,
  );
});
