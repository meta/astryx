// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file BottomSheetPinchZoom.a11y.chromium.spec.ts
 * @input Built BottomSheet stories and real Chromium touch input (CDP)
 * @output Browser evidence that a two-finger pinch on an open sheet zooms the
 *   page and leaves the sheet where it rests, while one-finger drag and scroll
 *   keep working (WCAG 1.4.4)
 * @position Chromium proof for the sheet's touch-action and pinch hand-off
 */

import {expect, test, type CDPSession, type Page} from '@playwright/test';
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

// A phone: the viewport meta applies and the page can pinch-zoom.
test.use({
  hasTouch: true,
  isMobile: true,
  viewport: {width: 390, height: 844},
  deviceScaleFactor: 3,
});

const sleep = async (ms: number) =>
  new Promise(resolve => setTimeout(resolve, ms));

async function openSheet(page: Page) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-bottomsheet--text-only&viewMode=story`,
  );
  const dialog = page.getByRole('dialog', {name: 'Reading details'});
  await expect(dialog).toBeVisible();
  const sheet = dialog.locator('.astryx-bottom-sheet').first();
  await expect(sheet).toBeVisible();
  await page.waitForTimeout(800); // the entrance
  const box = await sheet.boundingBox();
  if (box == null) {
    throw new Error('no sheet box');
  }
  expect(await page.evaluate(() => window.visualViewport?.scale)).toBe(1);
  return {dialog, sheet, box};
}

type Point = {x: number; y: number};

// Two fingers land one after the other and spread apart, as a person pinches.
// The spread is wide enough to clear the browser's minimum pinch span.
async function pinch(cdp: CDPSession, first: Point, second: Point) {
  const steps = 12;
  const spread = 3;
  const mid = {x: (first.x + second.x) / 2, y: (first.y + second.y) / 2};
  const at = (p: Point, k: number, id: number) => ({
    x: mid.x + (p.x - mid.x) * k,
    y: mid.y + (p.y - mid.y) * k,
    id,
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [at(first, 1, 1)],
  });
  await sleep(30);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [at(first, 1, 1), at(second, 1, 2)],
  });
  for (let i = 1; i <= steps; i++) {
    await sleep(16);
    const k = 1 + ((spread - 1) * i) / steps;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [at(first, k, 1), at(second, k, 2)],
    });
  }
  await sleep(16);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await sleep(600);
}

// Record the furthest the sheet travelled while the fingers were down.
async function trackSheetTravel(page: Page) {
  await page.evaluate(() => {
    const sheet = document.querySelector('.astryx-bottom-sheet')!;
    const top = () => sheet.getBoundingClientRect().top;
    const start = top();
    const w = window as unknown as {__travel: number};
    w.__travel = 0;
    const sample = () => {
      w.__travel = Math.max(w.__travel, Math.abs(top() - start));
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

// `maxTravel` is how far the sheet may move while the fingers are down. A pinch
// is not a drag, so it is 2px except in one order: a finger that lands off the
// sheet is invisible to the sheet until the handle finger's next touch event,
// and the browser delivers that finger's pointermove first. That one input
// sample can move the sheet before it yields and returns to its detent.
const PINCHES: {
  name: string;
  fingers: (box: Box) => [Point, Point];
  maxTravel?: number;
}[] = [
  {
    name: 'across the handle and the body',
    fingers: box => [
      {x: box.x + box.width / 2, y: box.y + 12},
      {x: box.x + box.width / 2 + 10, y: box.y + 90},
    ],
  },
  {
    name: 'at the top of the body, spreading vertically',
    fingers: box => [
      {x: box.x + box.width / 2, y: box.y + 160},
      {x: box.x + box.width / 2 + 10, y: box.y + 220},
    ],
  },
  {
    name: 'across the body and the handle, body finger first',
    fingers: box => [
      {x: box.x + box.width / 2 + 10, y: box.y + 90},
      {x: box.x + box.width / 2, y: box.y + 12},
    ],
  },
  {
    name: 'at the top of the body, lower finger first',
    fingers: box => [
      {x: box.x + box.width / 2 + 10, y: box.y + 220},
      {x: box.x + box.width / 2, y: box.y + 160},
    ],
  },
  {
    name: 'from the handle and off the sheet above it',
    fingers: box => [
      {x: box.x + box.width / 2, y: box.y + 12},
      {x: box.x + box.width / 2 + 10, y: box.y - 70},
    ],
    maxTravel: 16,
  },
  {
    name: 'in the body, spreading sideways',
    fingers: box => [
      {x: box.x + box.width / 2 - 30, y: box.y + 280},
      {x: box.x + box.width / 2 + 30, y: box.y + 280},
    ],
  },
];
type Box = {x: number; y: number; width: number; height: number};

for (const {name, fingers, maxTravel = 2} of PINCHES) {
  test(`a pinch ${name} zooms the page and leaves the sheet at rest`, async ({
    page,
  }) => {
    const {dialog, sheet, box} = await openSheet(page);
    await trackSheetTravel(page);
    const cdp = await page.context().newCDPSession(page);
    const [first, second] = fingers(box);
    await pinch(cdp, first, second);

    expect(
      await page.evaluate(() => window.visualViewport?.scale ?? 1),
    ).toBeGreaterThan(1.2);
    // A pinch is not a drag: the sheet holds its detent.
    expect(
      await page.evaluate(
        () => (window as unknown as {__travel: number}).__travel,
      ),
    ).toBeLessThan(maxTravel);
    await expect(dialog).toBeVisible();
    // Layout-viewport coordinates: the zoom itself does not move them.
    expect(
      await sheet.evaluate(el => el.getBoundingClientRect().top),
    ).toBeCloseTo(box.y, 0);
  });
}

test('one finger still drags the handle and scrolls the body, without zooming', async ({
  page,
}) => {
  const {sheet, box} = await openSheet(page);
  const cdp = await page.context().newCDPSession(page);
  const x = box.x + box.width / 2;

  // Handle: the sheet follows the finger.
  const handleY = box.y + 12;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{x, y: handleY}],
  });
  for (let i = 1; i <= 10; i++) {
    await sleep(16);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{x, y: handleY + i * 12}],
    });
  }
  await sleep(50);
  const dragged = await sheet.boundingBox();
  expect((dragged?.y ?? box.y) - box.y).toBeGreaterThan(80);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchCancel',
    touchPoints: [],
  });

  // Body, on a fresh sheet (that drag may have thrown the first one away): a
  // swipe up scrolls the content.
  await openSheet(page);
  const body = sheet.locator('[role="group"]').first();
  const before = await body.evaluate(el => el.scrollTop);
  const startY = box.y + box.height - 100;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{x, y: startY}],
  });
  for (let i = 1; i <= 10; i++) {
    await sleep(16);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{x, y: startY - i * 25}],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await page.waitForTimeout(600);
  expect(await body.evaluate(el => el.scrollTop)).toBeGreaterThan(before + 100);
  expect(await page.evaluate(() => window.visualViewport?.scale)).toBe(1);
});
