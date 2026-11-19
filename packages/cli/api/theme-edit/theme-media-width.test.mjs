// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The layer drawing answers a width or height media query for the
 * window its pictures are taken in, so a part drawn open lays out as the
 * picture shows it: AlertDialog's buttons sit side by side at that width,
 * never in its phone layout.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditShow} from './theme-edit.mjs';
import {desktopMatches} from '../../foundation/render/layers.mjs';
import {PICTURE_WINDOW} from '../../foundation/render/picture-window.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {appPackages} from '../../test-utils/theme-edit-fixture.mjs';
import {realRenders} from '../../test-utils/theme-render-stub.mjs';

// (These cases read the drawn pages, their pictures or what a drawing
// reports: drawn for real.)
realRenders(true);

const T = 240_000;

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-media-width-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  fs.writeFileSync(
    path.join(cwd, 'package.json'),
    `${JSON.stringify(appPackages({packageManager: 'npm@10.9.0'}))}\n`,
  );
  await themeEditNew('t', {cwd, like: 'neutral'});
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('a media query in the picture window', () => {
  it('is answered for its width and height', () => {
    const {width, height} = PICTURE_WINDOW;
    expect(desktopMatches(`(max-width: ${width - 1}px)`)).toBe(false);
    expect(desktopMatches(`(min-width: ${width}px)`)).toBe(true);
    expect(desktopMatches('(max-width: 640px)')).toBe(false);
    expect(desktopMatches(`(min-width: ${width / 16}em)`)).toBe(true);
    expect(desktopMatches('(width < 640px)')).toBe(false);
    expect(desktopMatches(`(400px < width <= ${width}px)`)).toBe(true);
    expect(desktopMatches(`(max-height: ${height - 1}px)`)).toBe(false);
    expect(desktopMatches('(orientation: landscape)')).toBe(true);
    expect(desktopMatches('screen and (min-width: 1024px)')).toBe(true);
    expect(desktopMatches('print')).toBe(false);
    expect(desktopMatches('not all and (max-width: 640px)')).toBe(true);
    // The pointer is a mouse, and a feature it does not judge holds.
    expect(desktopMatches('(pointer: coarse)')).toBe(false);
    expect(desktopMatches('(prefers-reduced-motion: reduce)')).toBe(true);
  });

  it(
    "draws AlertDialog's buttons side by side on the open states page",
    async () => {
      await themeEditShow('t', {cwd, section: 'overlays'});
      const html = fs.readFileSync(
        path.join(cwd, 'themes/t/sheet-overlays.html'),
        'utf8',
      );
      const at = html.indexOf('<div class="cs-name">AlertDialog</div>');
      expect(at).toBeGreaterThan(-1);
      const cell = html.slice(
        at,
        html.indexOf('<div class="cs-name">', at + 1),
      );
      // A desktop row puts Cancel first; the phone layout stacks the action
      // above it. Each label is read as a button's own text, never the title
      // ("Delete item?").
      const cancel = cell.search(/>\s*Cancel\s*</);
      const action = cell.search(/>\s*Delete\s*</);
      expect(cancel).toBeGreaterThan(-1);
      expect(action).toBeGreaterThan(-1);
      expect(cancel).toBeLessThan(action);
    },
    T,
  );
});
