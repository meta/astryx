// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A border color where the theme turns some of the part's border off:
 * the sides are read in the order the settings are written, a width or
 * style of several values names each side, a logical pair its start and
 * end. A color on sides the theme turned off is refused, naming the none;
 * a color with a side that still draws is saved as written, and no border
 * is brought while the theme turns any side off. Undoing that none brings
 * the border a saved color needs.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditUndo} from './theme-edit.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

const T = 240_000;

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-border-none-sides-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('s', {cwd, like: 'neutral'});
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/**
 * Sets the nones, then each color: `true` it is saved, `false` refused.
 * Every change is undone after.
 * @param {Array<[string, string]>} nones
 * @param {Array<[string, boolean]>} colors
 */
async function check(nones, colors) {
  for (const [thing, value] of nones)
    await themeEditSet('s', thing, value, {cwd, on: 'tab'});
  for (const [thing, saved] of colors) {
    const run = () => themeEditSet('s', thing, '#999999', {cwd, on: 'tab'});
    if (saved) {
      const r = await run();
      expect(r.data.setting.thing, thing).toBe(thing);
      // (No border is brought while the theme turns a side off.)
      expect(r.data.notes.join('\n'), thing).not.toContain('added a');
      await themeEditUndo('s', {cwd});
    } else {
      const r = await refusal(run);
      expect(r?.code, thing).toBe('ERR_THEME_NO_EFFECT');
    }
  }
  for (let k = 0; k < nones.length; k++) await themeEditUndo('s', {cwd});
}

describe('a border none on some sides', () => {
  it(
    'reads each side of a width or style of several values',
    async () => {
      await check(
        [['border-width', '0 0 1px']],
        [
          ['border-color', true],
          ['border-bottom-color', true],
          ['border-top-color', false],
        ],
      );
      await check(
        [['border-style', 'none none solid']],
        [
          ['border-bottom-color', true],
          ['border-left-color', false],
        ],
      );
    },
    T,
  );

  it(
    "reads one side's none",
    async () => {
      await check(
        [['border-bottom', 'none']],
        [
          ['border-color', true],
          ['border-bottom-color', false],
        ],
      );
    },
    T,
  );

  it(
    "reads a logical pair's start and end",
    async () => {
      await check(
        [['border-block-width', '0 1px']],
        [
          ['border-top-color', false],
          ['border-bottom-color', true],
        ],
      );
      await check(
        [['border-inline-style', 'none']],
        [
          ['border-left-color', false],
          ['border-top-color', true],
        ],
      );
    },
    T,
  );

  it(
    'reads the settings in order: a later side drawn again shows',
    async () => {
      await check(
        [
          ['border', 'none'],
          ['border-top', '1px solid'],
        ],
        [
          ['border-top-color', true],
          ['border-bottom-color', false],
        ],
      );
      await check(
        [
          ['border-width', '0'],
          ['border-bottom-width', '2px'],
        ],
        [
          ['border-bottom-color', true],
          ['border-top-color', false],
        ],
      );
    },
    T,
  );
});

describe('undoing a border none', () => {
  it(
    'brings the border a saved border color needs',
    async () => {
      await themeEditSet('s', 'border-width', '0 0 1px', {cwd, on: 'tab'});
      await themeEditSet('s', 'border-color', '#999999', {cwd, on: 'tab'});
      await themeEditUndo('s', {cwd, thing: 'border-width', on: 'tab'});
      const built = fs.readFileSync(path.join(cwd, 'themes/s/s.css'), 'utf8');
      expect(built).toMatch(
        /\.astryx-tab \{\s*border: var\(--border-width\) solid transparent;/,
      );
      expect(built).toContain('border-color: #999999;');
      await themeEditUndo('s', {cwd});
    },
    T,
  );
});
