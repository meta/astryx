// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A border color where the theme turns some of the part's border off:
 * the sides are read in the order the settings are written, a width or
 * style of several values names each side, a logical pair its start and
 * end. A color on sides the theme turned off is refused, naming the none;
 * a color with a side that still draws is saved, and on a part Core draws
 * no border on it brings the border before the part's own border settings,
 * so the sides the theme turns off or sizes keep theirs. Undoing that none
 * brings the border a saved color needs.
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

describe("the border a color brings beside the part's own", () => {
  it(
    'goes before them: a side turned off stays off, a side sized keeps its size',
    async () => {
      const css = () =>
        fs.readFileSync(path.join(cwd, 'themes/s/s.css'), 'utf8');
      await themeEditSet('s', 'border-bottom', 'none', {cwd, on: 'tab'});
      await themeEditSet('s', 'border-color', '#999999', {cwd, on: 'tab'});
      expect(css()).toMatch(
        /\.astryx-tab \{\s*border: var\(--border-width\) solid transparent;\s*border-bottom: none;\s*border-color: #999999;/,
      );
      await themeEditUndo('s', {cwd});
      await themeEditUndo('s', {cwd});
      await themeEditSet('s', 'border-top-width', '2px', {cwd, on: 'tab'});
      await themeEditSet('s', 'border-color', '#999999', {cwd, on: 'tab'});
      expect(css()).toMatch(
        /\.astryx-tab \{\s*border: var\(--border-width\) solid transparent;\s*border-top-width: 2px;\s*border-color: #999999;/,
      );
      await themeEditUndo('s', {cwd});
      await themeEditUndo('s', {cwd});
    },
    T,
  );
});

describe('a shorthand with no style', () => {
  it(
    'is no line the theme draws: a color still brings its border',
    async () => {
      await themeEditSet('s', 'border-top', '1px', {cwd, on: 'tab'});
      const r = await themeEditSet('s', 'border-color', '#999999', {
        cwd,
        on: 'tab',
      });
      expect(r.data.notes.join('\n')).toContain('added a');
      const built = fs.readFileSync(path.join(cwd, 'themes/s/s.css'), 'utf8');
      expect(built).toMatch(
        /\.astryx-tab \{\s*border: var\(--border-width\) solid transparent;\s*border-top: 1px;\s*border-color: #999999;/,
      );
      await themeEditUndo('s', {cwd});
      await themeEditUndo('s', {cwd});
    },
    T,
  );

  it(
    'draws no line on its side',
    async () => {
      await check(
        [
          ['border', 'none'],
          ['border-top', '1px'],
        ],
        [['border-top-color', false]],
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

  it(
    "brings it again before the part's own border settings",
    async () => {
      await themeEditNew('s2', {cwd, like: 'neutral'});
      // (A color saved with no border, as an earlier editor saved it,
      // beside a bottom the theme turned off.)
      const file = path.join(cwd, 'themes/s2/s2.settings.json');
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      saved.settings.push(
        {thing: 'border-bottom', value: 'none', source: 'property', on: 'tab'},
        {
          thing: 'border-color',
          value: '#999999',
          source: 'property',
          on: 'tab',
        },
      );
      fs.writeFileSync(file, JSON.stringify(saved, null, 2));
      // (The same color again brings the border, before the bottom's none.)
      const r = await themeEditSet('s2', 'border-color', '#999999', {
        cwd,
        on: 'tab',
      });
      expect(r.data.notes.join('\n')).toContain('added a');
      const built = fs.readFileSync(path.join(cwd, 'themes/s2/s2.css'), 'utf8');
      expect(built).toMatch(
        /\.astryx-tab \{\s*border: var\(--border-width\) solid transparent;\s*border-bottom: none;\s*border-color: #999999;/,
      );
    },
    T,
  );

  it(
    'takes back the border set added, and does not write it again',
    async () => {
      await themeEditNew('s3', {cwd, like: 'neutral'});
      await themeEditSet('s3', 'border-color', '#999999', {cwd, on: 'tab'});
      await themeEditUndo('s3', {cwd, thing: 'border', on: 'tab'});
      const saved = JSON.parse(
        fs.readFileSync(path.join(cwd, 'themes/s3/s3.settings.json'), 'utf8'),
      );
      expect(
        saved.settings.filter(
          (/** @type {any} */ x) => x.thing === 'border' && x.on === 'tab',
        ),
      ).toEqual([]);
      await themeEditUndo('s3', {cwd, thing: 'border-color', on: 'tab'});
    },
    T,
  );
});
