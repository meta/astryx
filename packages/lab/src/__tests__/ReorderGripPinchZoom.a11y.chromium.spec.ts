// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ReorderGripPinchZoom.a11y.chromium.spec.ts
 * @input The checked-in Lab/ListInput › Tag Options and Lab/TransferList ›
 *   Default stories, a built Storybook and real Chromium touch input (CDP) on
 *   a phone viewport
 * @output Browser evidence that a pinch which starts on, or reaches, a reorder
 *   grip zooms the page and leaves the order as it was, while a one-finger
 *   drag on the grip still reorders (WCAG 1.4.4)
 * @position Chromium proof for the shared Lab reorder grip's `touch-action`
 *   (packages/lab/src/reorderStyles.ts)
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

interface Surface {
  name: string;
  story: string;
  /** The first row's reorder grip. */
  grip: string;
  /** Every reorderable row, in display order, keyed by this attribute. */
  rowAttribute: string;
}

const SURFACES: Surface[] = [
  {
    name: 'ListInput',
    story: 'lab-listinput--tag-options',
    grip: 'button[data-list-input-reorder]',
    rowAttribute: 'data-list-input-row',
  },
  {
    name: 'TransferList',
    story: 'lab-transferlist--default',
    grip: '[data-transfer-list-row]:not([data-transfer-list-row=""]) button[aria-pressed]',
    rowAttribute: 'data-transfer-list-row',
  },
];

async function openStory(page: Page, surface: Surface) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=${surface.story}&viewMode=story`,
  );
  const grip = page.locator(surface.grip).first();
  await expect(grip).toBeVisible();
  expect(await page.evaluate(() => window.visualViewport?.scale)).toBe(1);
  const box = (await grip.boundingBox()) as Box;
  const center = {x: box.x + box.width / 2, y: box.y + box.height / 2};
  const cdp = await page.context().newCDPSession(page);
  return {center, cdp, order: await readOrder(page, surface)};
}

async function readOrder(page: Page, surface: Surface) {
  return page.evaluate(
    attribute =>
      Array.from(document.querySelectorAll(`[${attribute}]`))
        .map(row => row.getAttribute(attribute))
        .filter((key): key is string => key != null && key !== ''),
    surface.rowAttribute,
  );
}

const zoom = async (page: Page) =>
  page.evaluate(() => window.visualViewport?.scale ?? 1);

async function touch(
  cdp: CDPSession,
  type: 'touchStart' | 'touchMove' | 'touchEnd',
  points: Point[],
) {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map((point, index) => ({...point, id: index + 1})),
  });
}

// Two fingers land one after the other and spread apart, as a person pinches.
// The spread is wide enough to clear the browser's minimum pinch span.
async function pinch(cdp: CDPSession, first: Point, second: Point) {
  const steps = 12;
  const spread = 2.5;
  const mid = {x: (first.x + second.x) / 2, y: (first.y + second.y) / 2};
  const at = (p: Point, k: number) => ({
    x: mid.x + (p.x - mid.x) * k,
    y: mid.y + (p.y - mid.y) * k,
  });
  await touch(cdp, 'touchStart', [first]);
  await sleep(30);
  await touch(cdp, 'touchStart', [first, second]);
  for (let i = 1; i <= steps; i++) {
    await sleep(16);
    const k = 1 + ((spread - 1) * i) / steps;
    await touch(cdp, 'touchMove', [at(first, k), at(second, k)]);
  }
  await sleep(16);
  await touch(cdp, 'touchEnd', []);
  await sleep(600);
}

for (const surface of SURFACES) {
  test.describe(surface.name, () => {
    test('a pinch whose first finger lands on a grip zooms the page', async ({
      page,
    }) => {
      const {center, cdp, order} = await openStory(page, surface);
      await pinch(cdp, center, {x: center.x + 40, y: center.y + 140});
      expect(await zoom(page)).toBeGreaterThan(1.2);
      expect(await readOrder(page, surface)).toEqual(order);
    });

    test('a pinch whose second finger lands on a grip zooms the page', async ({
      page,
    }) => {
      const {center, cdp, order} = await openStory(page, surface);
      await pinch(cdp, {x: center.x + 40, y: center.y + 140}, center);
      expect(await zoom(page)).toBeGreaterThan(1.2);
      expect(await readOrder(page, surface)).toEqual(order);
    });

    test('a one-finger drag on a grip still reorders', async ({page}) => {
      const {center, cdp, order} = await openStory(page, surface);
      const rows = await page.evaluate(
        attribute =>
          Array.from(document.querySelectorAll(`[${attribute}]`))
            .filter(row => row.getAttribute(attribute))
            .map(row => row.getBoundingClientRect().top),
        surface.rowAttribute,
      );
      // Past the second row's centre: the first row lands second or later.
      const distance = (rows[2] - rows[0]) * 0.9;
      await touch(cdp, 'touchStart', [center]);
      for (let i = 1; i <= 20; i++) {
        await sleep(16);
        await touch(cdp, 'touchMove', [
          {x: center.x, y: center.y + (distance * i) / 20},
        ]);
      }
      await sleep(100);
      await touch(cdp, 'touchEnd', []);
      await sleep(600);
      expect(await zoom(page)).toBe(1);
      const after = await readOrder(page, surface);
      expect(after).not.toEqual(order);
      expect(after.indexOf(order[0])).toBeGreaterThan(0);
    });
  });
}
