// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The font probe reads the same font each time the same page is
 * pictured: a theme's preview page, opened again and again in a browser
 * that starts cold each time and probed after its picture, gives the same
 * font for each role every time, so the "this machine has none of …" note
 * built from it does not come and go.
 */

import * as fs from 'node:fs';
import {createRequire} from 'node:module';
import * as path from 'node:path';
import {pathToFileURL} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditShow} from './theme-edit.mjs';
import {probeFonts} from '../../foundation/render/font-probe.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

const T = 600_000;

/** How many times the page is pictured, each in a browser started cold. */
const RUNS = 20;

const chrome = [
  ...(process.env.PATH ?? '')
    .split(path.delimiter)
    .flatMap(d =>
      ['google-chrome', 'chromium', 'chromium-browser', 'chrome'].map(n =>
        path.join(d, n),
      ),
    ),
].find(f => {
  try {
    fs.accessSync(f, fs.constants.X_OK);
    return fs.statSync(f).isFile();
  } catch {
    return false;
  }
});

/** @type {string} */
let cwd;

beforeAll(async () => {
  if (!chrome) return;
  cwd = makeLinkedFixture('astryx-theme-picture-font-probe-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
  await themeEditShow('t', {cwd, png: true});
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('the font a picture reads', () => {
  it.skipIf(!chrome)(
    'is the same on every cold picture of the same page',
    async () => {
      const {chromium} = createRequire(import.meta.url)('playwright');
      const page = pathToFileURL(path.join(cwd, 'themes/t/preview.html')).href;
      /** @type {Set<string>} */
      const seen = new Set();
      for (let i = 0; i < RUNS; i++) {
        const browser = await chromium.launch({executablePath: chrome});
        try {
          const tab = await browser.newPage({viewport: {width: 1280, height: 900}});
          await tab.goto(page, {waitUntil: 'load'});
          await tab.screenshot({fullPage: true});
          const cdp = await tab.context().newCDPSession(tab);
          const fonts = await probeFonts((method, params) => cdp.send(method, params));
          seen.add(JSON.stringify({heading: fonts.heading?.shown, body: fonts.body?.shown}));
        } finally {
          await browser.close();
        }
      }
      expect([...seen]).toHaveLength(1);
    },
    T,
  );
});
