// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file show's missed summary counts misses and parts and names the hidden
 * misses as misses; a toast with a light fill is pictured with the text
 * side the app's measurement picks; disabled text is held to no 4.5:1 and
 * never whitened; set's note on a border width offers the frames show's
 * missed has (only parts that draw a box, none at a width of zero).
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
const ED = ['experimental', 'theme', 'editor'];
/** @type {string} */
let cwd;
/** @type {string} */
let unbuilt = '';
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-missed-summary-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  unbuilt = await installRealBaseThemes(cwd, ['neutral', 'stone']);
}, T);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe("show's missed summary", () => {
  it(
    'counts misses and parts, and the hidden misses as misses',
    async () => {
      await themeEditNew('m', {cwd, like: 'neutral'});
      await themeEditSet('m', '--border-width', '3px', {cwd});
      const json = /** @type {any} */ (await themeEditShow('m', {cwd})).data;
      const parts = new Set(json.missed.map((/** @type {any} */ x) => x.part));
      const text = (await runCli([...ED, 'show', 'm'], {cwd})).stdout;
      expect(text).toContain(
        `missed (${json.missed.length} misses on ${parts.size} parts`,
      );
      expect(text).toMatch(
        new RegExp(
          `unreached: +${json.missed.length - 6} more misses \\(on \\d+ parts\\)`,
        ),
      );
    },
    T,
  );
});

describe('a toast with a light fill', () => {
  it(
    'is pictured with dark text, as the app draws it',
    async () => {
      await themeEditNew('y', {cwd, like: 'neutral'});
      await themeEditSet('y', 'background-color', '#fde047', {
        cwd,
        on: 'toast',
      });
      await themeEditShow('y', {cwd});
      const html = fs.readFileSync(
        path.join(cwd, 'themes/y/sheet.html'),
        'utf8',
      );
      const sides = [
        ...html.matchAll(
          /class="astryx-toast[^"]*"[^>]*>\s*<div data-astryx-media="(dark|light)"/g,
        ),
      ].map(m => m[1]);
      expect(sides.length).toBeGreaterThan(0);
      expect(new Set(sides)).toEqual(new Set(['light']));
    },
    T,
  );
});

describe('disabled text', () => {
  it(
    'is held to no 4.5:1, and no fix whitens it',
    async () => {
      if (unbuilt) return;
      await themeEditNew('s', {cwd, like: 'stone'});
      const r = /** @type {any} */ (
        await themeEditSet('s', 'neutral', '#78716c', {cwd})
      ).data;
      for (const p of [
        ...r.newProblems,
        .../** @type {any} */ (await themeEditShow('s', {cwd})).data
          .openProblems,
      ])
        expect(p.fix ?? '').not.toMatch(/--color-text-disabled/);
    },
    T,
  );
});

describe("set's note on a border width", () => {
  it(
    'frames only what draws a box, scoped as show scopes it, and nothing at zero',
    async () => {
      await themeEditNew('b', {cwd, like: 'neutral'});
      const two = (
        await runCli([...ED, 'set', 'b', '--border-width', '2px'], {cwd})
      ).stdout;
      expect(two).not.toMatch(/--on (item|toggle-button)\b/);
      expect(two).not.toMatch(/--on button$/m);
      expect(two).toMatch(/--on button --when variant:primary/);
      const zero = (
        await runCli([...ED, 'set', 'b', '--border-width', '0'], {cwd})
      ).stdout;
      expect(zero).not.toMatch(/border '0 solid/);
    },
    T,
  );
});
