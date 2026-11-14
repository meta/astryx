// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The sheet of a theme with both modes renders each part as the app
 * renders it in each mode: a part that picks its look from the mode as it
 * renders (a Toast's text on its inverted surface) has a light render and a
 * dark render, and the page shows the one of the mode it is in.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
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

/** @type {string} */
let cwd;
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-sheet-modes-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
}, 240_000);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('the sheet in each mode', () => {
  it("a Toast's dark render is the app's dark render, shown in dark", async () => {
    await themeEditShow('t', {cwd, section: 'overlays'});
    const html = fs.readFileSync(
      path.join(cwd, 'themes/t/sheet-overlays.html'),
      'utf8',
    );
    /** The media side of the toasts in one mode's renders. @param {string} side */
    const toastMedia = side =>
      html
        .split(`class="cs-${side}">`)
        .slice(1)
        .map(seg => seg.split('class="cs-')[0])
        .filter(seg => seg.includes('astryx-toast'))
        .map(seg => /data-astryx-media="([a-z]+)"/.exec(seg)?.[1]);
    expect(toastMedia('light').length).toBeGreaterThan(0);
    expect(toastMedia('light')).toContain('dark');
    expect(toastMedia('dark')).toContain('light');
    expect(html).toMatch(
      /@media \(prefers-color-scheme:dark\)\{\.cs-light\{display:none\}/,
    );
  }, 240_000);
});
