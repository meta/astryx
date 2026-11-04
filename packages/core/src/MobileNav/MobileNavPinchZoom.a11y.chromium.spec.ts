// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file MobileNavPinchZoom.a11y.chromium.spec.ts
 * @input Built MobileNav stories and real Chromium touch input (CDP)
 * @output Browser evidence that a two-finger pinch on the open nav, over its
 *   content or its backdrop, zooms the page (WCAG 1.4.4)
 * @position Chromium proof for MobileNav's touch-action declarations
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

async function openNav(page: Page) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-mobilenav--default&viewMode=story`,
  );
  await page.getByRole('button', {name: 'Open Navigation'}).tap();
  const nav = page.getByRole('dialog');
  await expect(nav).toBeVisible();
  await page.waitForTimeout(600); // the slide-in
  const panel = nav.getByRole('link', {name: 'Dashboard'});
  const box = await panel.boundingBox();
  if (box == null) {
    throw new Error('no nav item box');
  }
  expect(await page.evaluate(() => window.visualViewport?.scale)).toBe(1);
  return {nav, box};
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

test('a pinch on the nav content zooms the page', async ({page}) => {
  const {nav, box} = await openNav(page);
  const cdp = await page.context().newCDPSession(page);
  const x = box.x + box.width / 2;
  // A sideways spread: the content scrolls vertically, so a vertical spread
  // would spend its first stretch panning before the zoom takes over.
  await pinch(cdp, {x: x - 30, y: box.y + 80}, {x: x + 30, y: box.y + 80});
  expect(
    await page.evaluate(() => window.visualViewport?.scale ?? 1),
  ).toBeGreaterThan(1.2);
  await expect(nav).toBeVisible();
});

test('a pinch on the backdrop beside the nav zooms the page', async ({
  page,
}) => {
  const {nav} = await openNav(page);
  // The panel is the dialog's own child; the rest of the dialog is backdrop.
  // Whichever side the panel sits on, pinch in the strip beside it.
  const panel = await nav.locator(':scope > div').first().boundingBox();
  if (panel == null) {
    throw new Error('no nav panel box');
  }
  const viewport = page.viewportSize()!;
  const before = panel.x;
  const after = viewport.width - (panel.x + panel.width);
  const strip =
    before >= after
      ? {start: 0, end: panel.x}
      : {start: panel.x + panel.width, end: viewport.width};
  expect(strip.end - strip.start).toBeGreaterThan(40);
  const x = (strip.start + strip.end) / 2;
  const fingers = [
    {x: x - 4, y: 380},
    {x: x + 4, y: 440},
  ];
  // Both fingers land on the backdrop, outside the panel.
  for (const finger of fingers) {
    expect(finger.x < panel.x || finger.x > panel.x + panel.width).toBe(true);
    expect(
      await nav.evaluate(
        (dialog, p) => document.elementFromPoint(p.x, p.y) === dialog,
        finger,
      ),
    ).toBe(true);
  }
  const cdp = await page.context().newCDPSession(page);
  await pinch(cdp, fingers[0], fingers[1]);
  expect(
    await page.evaluate(() => window.visualViewport?.scale ?? 1),
  ).toBeGreaterThan(1.2);
  await expect(nav).toBeVisible();
});
