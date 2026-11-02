// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y always

/**
 * @file ItemSwipePinchZoom.a11y.chromium.spec.ts
 * @input The checked-in Core/Item › Swipe Actions story, a built Storybook and
 *   real Chromium two-finger touch input (CDP) on a phone viewport
 * @output Browser evidence that a pinch which starts on a swipeable row zooms
 *   the page and leaves the row where it is, whichever finger lands first and
 *   wherever the second one lands, while a one-finger sideways drag still
 *   swipes (WCAG 1.4.4)
 * @position Chromium proof for Item's swipe-row `touch-action` and the
 *   gesture's hand-off of a second finger
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

type Point = {x: number; y: number};
type Box = {x: number; y: number; width: number; height: number};

async function openStory(page: Page) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-item--swipe-actions&viewMode=story`,
  );
  const rows = page.locator('.astryx-item');
  const row = rows.first();
  await expect(row.getByText('Message 1')).toBeVisible();
  // The gesture arrives with the lazily loaded swipe layer; its panel is the
  // sign the row can be dragged.
  await expect(row.locator('[data-swipe-panel="leading"]')).toBeAttached();
  const box = (await row.boundingBox()) as Box;
  const next = (await rows.nth(1).boundingBox()) as Box;
  expect(await page.evaluate(() => window.visualViewport?.scale)).toBe(1);
  // Record how far the first row ever moves sideways while fingers are down.
  await page.evaluate(() => {
    const el = document.querySelector('.astryx-item') as HTMLElement;
    const w = window as unknown as {__maxTravel: number};
    w.__maxTravel = 0;
    const tick = () => {
      const travel = Math.abs(new DOMMatrix(getComputedStyle(el).transform).e);
      w.__maxTravel = Math.max(w.__maxTravel, travel);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const cdp = await page.context().newCDPSession(page);
  return {box, next, cdp};
}

const zoom = async (page: Page) =>
  page.evaluate(() => window.visualViewport?.scale ?? 1);
const maxTravel = async (page: Page) =>
  page.evaluate(() => (window as unknown as {__maxTravel: number}).__maxTravel);

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

test('a sideways pinch on a swipeable row zooms the page and the row stays put', async ({
  page,
}) => {
  const {box, cdp} = await openStory(page);
  const y = box.y + box.height / 2;
  const x = box.x + box.width / 2;
  await pinch(cdp, {x: x - 30, y}, {x: x + 30, y});
  expect(await zoom(page)).toBeGreaterThan(1.2);
  expect(await maxTravel(page)).toBeLessThan(1);
});

test('a vertical pinch starting on a swipeable row zooms the page', async ({
  page,
}) => {
  const {box, next, cdp} = await openStory(page);
  const x = box.x + box.width / 2;
  await pinch(
    cdp,
    {x, y: box.y + box.height / 2},
    {x, y: next.y + next.height / 2},
  );
  expect(await zoom(page)).toBeGreaterThan(1.2);
  expect(await maxTravel(page)).toBeLessThan(1);
});

test('a pinch with the first finger on the row and the second off it zooms the page', async ({
  page,
}) => {
  const {box, cdp} = await openStory(page);
  const y = box.y + box.height / 2;
  // The page below the list: no row, no swipe.
  await pinch(cdp, {x: box.x + 120, y}, {x: box.x + 220, y: 700});
  expect(await zoom(page)).toBeGreaterThan(1.2);
  expect(await maxTravel(page)).toBeLessThan(1);
});

test('a pinch with the first finger off the row and the second on it zooms the page', async ({
  page,
}) => {
  const {box, cdp} = await openStory(page);
  const y = box.y + box.height / 2;
  await pinch(cdp, {x: box.x + 220, y: 700}, {x: box.x + 120, y});
  expect(await zoom(page)).toBeGreaterThan(1.2);
  expect(await maxTravel(page)).toBeLessThan(1);
});

test('a one-finger sideways drag still swipes the row and leaves the zoom alone', async ({
  page,
}) => {
  const {box, cdp} = await openStory(page);
  const y = box.y + box.height / 2;
  const startX = box.x + 24;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{x: startX, y}],
  });
  for (const dx of [6, 14, 28, 44, 60]) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{x: startX + dx, y}],
    });
    await sleep(40);
  }
  await expect.poll(async () => maxTravel(page)).toBeGreaterThan(50);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  expect(await zoom(page)).toBe(1);
});
