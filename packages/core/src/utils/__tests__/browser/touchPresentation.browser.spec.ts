// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file touchPresentation.browser.spec.ts
 * @input fixture.ts bundled with esbuild; Chromium as an Android phone and
 *   WebKit on a phone-sized touch screen (playwright.config.ts beside this
 *   file)
 * @output What each engine answers: a coarse pointer in both; no
 *   -webkit-touch-callout in either (only WebKit on iOS and iPadOS implements
 *   it, so both resolve the `default` idiom and the theme's motion); a style
 *   under the touch query applies while one under the iOS gate does not
 * @position Real-engine proof of packages/core/src/utils/touchPresentation.ts.
 *   The `ios` answer needs Mobile Safari, which no Playwright engine is: it
 *   was read on the iOS 26.2 simulator.
 */

import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {expect, test, type Page} from '@playwright/test';

let bundle = '';

test.beforeAll(async () => {
  const result = await build({
    entryPoints: [
      path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixture.ts'),
    ],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    define: {'process.env.NODE_ENV': '"production"'},
  });
  bundle = result.outputFiles[0].text;
});

async function open(page: Page) {
  await page.goto('about:blank');
  await page.setContent(
    '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><body></body>',
  );
  await page.addScriptTag({content: bundle});
  await page.waitForFunction(() => window.__answers != null);
  return page.evaluate(() => window.__answers);
}

const color = async (page: Page, id: string) =>
  page.evaluate(
    target =>
      getComputedStyle(document.getElementById(target) as Element).color,
    id,
  );

test('a finger outside iOS WebKit is the default idiom, with the theme’s motion', async ({
  page,
}) => {
  const answers = await open(page);
  expect(answers).toMatchObject({
    coarse: true,
    touchCallout: false,
    idiom: 'default',
    motion: 'theme',
    presentation: {isTouch: true, isCompact: true, idiom: 'default'},
    read: {isTouch: true, isCompact: true, idiom: 'default'},
  });
  // The touch style applies; the iOS-only style does not.
  expect(await color(page, 'touch')).toBe('rgb(255, 0, 0)');
  expect(await color(page, 'gate')).toBe('rgb(0, 0, 255)');
});
