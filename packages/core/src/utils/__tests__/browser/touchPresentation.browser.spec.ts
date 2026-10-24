// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file touchPresentation.browser.spec.ts
 * @input fixture.ts bundled with esbuild; Chromium as an Android phone and
 *   WebKit on a phone-sized touch screen (playwright.config.ts beside this
 *   file)
 * @output What each engine answers: a coarse pointer and a compact viewport
 *   in both, the same touch presentation; no -webkit-touch-callout in either
 *   (only WebKit on iOS and iPadOS implements it); a style under the touch
 *   query applies while one under the iOS style gate does not
 * @position Real-engine proof of packages/core/src/utils/touchPresentation.ts.
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

test('a finger gets the touch presentation in every engine', async ({page}) => {
  const answers = await open(page);
  expect(answers).toMatchObject({
    coarse: true,
    touchCallout: false,
    presentation: {isTouch: true, isCompact: true, isCompactTouch: true},
    read: {isTouch: true, isCompact: true, isCompactTouch: true},
  });
  // The touch style applies; the iOS-only style does not.
  expect(await color(page, 'touch')).toBe('rgb(255, 0, 0)');
  expect(await color(page, 'gate')).toBe('rgb(0, 0, 255)');
});
