// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The pictures draw a toast's text on the side the app's own
 * measurement picks for the fill it draws, dark or light, in each mode and
 * for each type a fill is set for: light text on a navy toast, dark text
 * on a yellow one, and an error toast's own fill read apart.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {realRenders} from '../../test-utils/theme-render-stub.mjs';

// (These cases read the drawn pages, their pictures or what a drawing
// reports: drawn for real.)
realRenders(true);

const T = 300_000;
/** @type {string} */
let cwd;
beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-toast-picture-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
}, T);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/**
 * The side each toast's media surface takes in the sheet, by its type.
 * @param {string} slug
 */
const sides = slug => {
  const html = fs.readFileSync(
    path.join(cwd, `themes/${slug}/sheet.html`),
    'utf8',
  );
  return [
    ...html.matchAll(
      /(<[a-z]+\b[^>]*class="astryx-toast[ "][^>]*>)\s*<div data-astryx-media="(dark|light)"/g,
    ),
  ].map(m => `${/data-type="(\w+)"/.exec(m[1])?.[1] ?? '-'}:${m[2]}`);
};

describe("a toast's text in the pictures", () => {
  it(
    'is light on a navy fill in both modes',
    async () => {
      await themeEditNew('n', {cwd, like: 'neutral'});
      await themeEditSet('n', 'background-color', '#1e3a8a', {
        cwd,
        on: 'toast',
      });
      await themeEditShow('n', {cwd});
      const got = sides('n');
      expect(got.length).toBeGreaterThan(0);
      for (const s of got) expect(s).toMatch(/:dark$/);
    },
    T,
  );

  it(
    'is dark on a yellow fill in both modes',
    async () => {
      await themeEditNew('y', {cwd, like: 'neutral'});
      await themeEditSet('y', 'background-color', '#fde047', {
        cwd,
        on: 'toast',
      });
      await themeEditShow('y', {cwd});
      for (const s of sides('y')) expect(s).toMatch(/:light$/);
    },
    T,
  );

  it(
    'reads a fill set for one type apart',
    async () => {
      await themeEditNew('e', {cwd, like: 'neutral'});
      await themeEditSet('e', 'background-color', '#fde047', {
        cwd,
        on: 'toast',
        when: 'type:error',
      });
      await themeEditShow('e', {cwd});
      const got = sides('e');
      expect(got.filter(s => s.startsWith('error:'))).not.toEqual([]);
      for (const s of got.filter(s => s.startsWith('error:')))
        expect(s).toBe('error:light');
    },
    T,
  );
});
