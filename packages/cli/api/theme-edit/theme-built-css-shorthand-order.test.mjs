// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Built theme CSS never writes a shorthand after a longhand it covers
 * for the same selector: the longhand set first would never show (a
 * selected tab's per-side border colors reset by a `border` repeated after
 * them). Checked on every official theme's build and on an editor theme
 * that mixes whole borders, per-side colors, one side's colors, states and
 * one-mode settings.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';
import {shorthandsAfterOwnLonghands} from '../../test-utils/css-shorthand-order.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

const T = 600_000;
const OFFICIAL = ['neutral', 'butter', 'chocolate', 'gothic', 'matcha', 'stone', 'y2k'];

/** @type {string} */
let cwd;
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-shorthand-order-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, OFFICIAL);
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('a shorthand after its own longhands', () => {
  it.each(OFFICIAL)(
    'is never written in the %s theme build',
    like => {
      if (unbuilt) return;
      const css = path.join(
        path.dirname(cwd),
        `node_modules/@astryxdesign/theme-${like}/dist/theme.css`,
      );
      expect(fs.existsSync(css)).toBe(true);
      expect(shorthandsAfterOwnLonghands(fs.readFileSync(css, 'utf8'))).toEqual(
        [],
      );
    },
  );

  it(
    'is never written for an editor theme of mixed whole and per-side borders',
    async () => {
      if (unbuilt) return;
      await themeEditNew('s', {cwd, like: 'neutral'});
      /** @type {Array<[string, string, Record<string, string>]>} */
      const steps = [
        ['border', '1px solid transparent', {on: 'tab'}],
        ['border-color', '#eeeeee #eeeeee #dddddd', {on: 'tab', state: 'hover'}],
        ['border-color', '#dddddd #dddddd transparent', {on: 'tab', state: 'selected'}],
        ['border-bottom-color', 'transparent', {on: 'tab', state: 'selected'}],
        ['border', '1px solid', {on: 'button', when: 'variant:primary'}],
        ['border-color', 'rgba(0, 0, 0, 0.1) rgba(0, 0, 0, 0.1) rgba(0, 0, 0, 0.25)', {on: 'button', when: 'variant:primary'}],
        ['border', '1px solid #cccccc', {on: 'inputs'}],
        ['border-color', '#cccccc #cccccc #999999', {on: 'inputs', state: 'focus-within'}],
        ['border-color', '#dddddd #dddddd #bbbbbb', {on: 'inputs', mode: 'light'}],
        ['border-color', '#ff0000 #00ff00', {on: 'banner'}],
        ['border-bottom', '1px solid #dddddd', {on: 'tab-list'}],
      ];
      for (const [thing, value, flags] of steps)
        await themeEditSet('s', thing, value, {cwd, ...flags});
      const css = fs.readFileSync(path.join(cwd, 'themes/s/s.css'), 'utf8');
      expect(shorthandsAfterOwnLonghands(css)).toEqual([]);
    },
    T,
  );
});
