// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file BottomSheetTouchscreenLaptop.a11y.chromium.spec.ts
 * @input Built BottomSheet stories, Chromium as a touchscreen laptop (a fine
 *   primary pointer and a screen that takes touches), and real touch input
 *   (CDP)
 * @output Browser evidence that a finger pulls the sheet down from the top of
 *   its content where the primary pointer is fine, as it does on a phone
 * @position Chromium proof for useSheetGestures' body pull under a finger
 *   on a touchscreen laptop
 */

import {expect, test, type Locator, type Page} from '@playwright/test';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

// A touchscreen laptop: the mouse is the primary pointer, and the screen
// sends touches. (Playwright's `hasTouch` would make the primary pointer
// coarse, a phone's.)
test.use({
  viewport: {width: 1280, height: 800},
  hasTouch: false,
  launchOptions: {
    args: [
      '--touch-events=enabled',
      '--blink-settings=primaryPointerType=4,availablePointerTypes=6,primaryHoverType=2,availableHoverTypes=3',
    ],
  },
});

async function openSheet(page: Page): Promise<Locator> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-bottomsheet--snap-points&viewMode=story`,
  );
  await page.getByRole('button', {name: 'Open nearby places'}).click();
  const dialog = page.getByRole('dialog', {name: 'Nearby places'});
  await expect(dialog).toBeVisible();
  const sheet = dialog.locator('.astryx-bottom-sheet').first();
  await expect(sheet).toBeVisible();
  await page.waitForTimeout(600); // the entrance
  return sheet;
}

async function sheetTop(sheet: Locator): Promise<number> {
  return sheet.evaluate(el => el.getBoundingClientRect().y);
}

test('the primary pointer is fine and the screen takes touches', async ({
  page,
}) => {
  await openSheet(page);
  expect(
    await page.evaluate(() => [
      matchMedia('(pointer: coarse)').matches,
      matchMedia('(any-pointer: coarse)').matches,
      'ontouchstart' in window,
    ]),
  ).toEqual([false, true, true]);
});

test('a finger pulls the sheet down from the top of its content', async ({
  page,
}) => {
  const sheet = await openSheet(page);
  const top = await sheetTop(sheet);
  const box = await sheet.boundingBox();
  if (box == null) {
    throw new Error('sheet not laid out');
  }
  const cdp = await page.context().newCDPSession(page);
  const x = box.x + box.width / 2;
  const y = box.y + 200;
  let time = Date.now() / 1000;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{x, y, id: 1}],
    timestamp: time,
  });
  // 120 px down, 4 px every 16 ms.
  for (let i = 1; i <= 30; i += 1) {
    time += 0.016;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{x, y: y + i * 4, id: 1}],
      timestamp: time,
    });
  }
  // The sheet follows the finger; the content does not scroll instead.
  await expect
    .poll(async () => (await sheetTop(sheet)) - top)
    .toBeGreaterThan(80);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
    timestamp: time + 0.4,
  });
});
