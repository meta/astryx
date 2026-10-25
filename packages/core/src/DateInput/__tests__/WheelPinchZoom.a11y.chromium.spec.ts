// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file WheelPinchZoom.a11y.chromium.spec.ts
 * @input The built TimeInput bottom-sheet story and real Chromium touch input
 *   (CDP) on a phone profile
 * @output Browser evidence that a two-finger pinch over an open picker wheel
 *   zooms the page (WCAG 1.4.4) and changes no value
 * @position Real-engine proof for the wheel's `touch-action`; jsdom computes
 *   no touch-action. The menus and listboxes have the same proof in
 *   MenuPinchZoom.a11y.chromium.spec.ts.
 */

import {
  expect,
  test,
  type CDPSession,
  type Locator,
  type Page,
} from '@playwright/test';
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

// The story's bottom-sheet TimeInput has no value, so its Minute wheel opens on
// the current minute, and the minute list ends at 59: a run near the end of an
// hour has no rows left to scroll. A fixed clock opens it on :30.
test.beforeEach(async ({page}) => {
  await page.clock.setFixedTime(new Date(2026, 0, 1, 10, 30));
});

const sleep = async (ms: number) =>
  new Promise(resolve => setTimeout(resolve, ms));

async function pageScale(page: Page) {
  return page.evaluate(() => window.visualViewport?.scale ?? 1);
}

async function centerOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (box == null) {
    throw new Error('no rendered bounds');
  }
  return {x: box.x + box.width / 2, y: box.y + box.height / 2};
}

type Point = {x: number; y: number};

// Two fingers land one after the other and spread apart sideways, as a person
// pinches. Sideways, because the wheel pans vertically: a vertical spread would
// spend its first stretch scrolling the wheel before the zoom takes over.
async function pinch(cdp: CDPSession, at: Point) {
  const steps = 12;
  const spread = 3;
  const point = (dx: number, k: number, id: number) => ({
    x: at.x + dx * k,
    y: at.y,
    id,
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [point(-30, 1, 1)],
  });
  await sleep(30);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [point(-30, 1, 1), point(30, 1, 2)],
  });
  for (let i = 1; i <= steps; i++) {
    await sleep(16);
    const k = 1 + ((spread - 1) * i) / steps;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [point(-30, k, 1), point(30, k, 2)],
    });
  }
  await sleep(16);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await sleep(600);
}

test('a pinch over an open picker wheel zooms the page and changes no value', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-timeinput--styling-parts&viewMode=story`,
  );
  const field = page.locator('[data-parts-row="control-bottom-sheet"] input');
  await expect(field).toBeVisible();
  await field.tap();
  const wheel = page.getByRole('listbox', {name: 'Minute'});
  await expect(wheel).toBeVisible();
  // Let the sheet finish presenting, so the pinch lands on a wheel at rest.
  await sleep(800);
  const valueBefore = await field.inputValue();
  expect(await pageScale(page)).toBe(1);

  const cdp = await page.context().newCDPSession(page);
  await pinch(cdp, await centerOf(wheel));

  expect(await pageScale(page)).toBeGreaterThan(1.2);
  await expect(wheel).toBeVisible();
  expect(await field.inputValue()).toBe(valueBefore);
});

test('one finger dragged up a wheel still scrolls it and leaves the page at scale 1', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-timeinput--styling-parts&viewMode=story`,
  );
  const field = page.locator('[data-parts-row="control-bottom-sheet"] input');
  await field.tap();
  const wheel = page.getByRole('listbox', {name: 'Minute'});
  await expect(wheel).toBeVisible();
  await sleep(800);
  const scrollTopBefore = await wheel.evaluate(el => el.scrollTop);

  const cdp = await page.context().newCDPSession(page);
  const at = await centerOf(wheel);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{x: at.x, y: at.y + 60, id: 1}],
  });
  for (let i = 1; i <= 12; i++) {
    await sleep(16);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{x: at.x, y: at.y + 60 - i * 10, id: 1}],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  // From :30 the drag has rows to go. The column snaps to its rows: this asks
  // that one finger scrolled it by at least one row, and left the page at
  // scale 1.
  const row = await wheel
    .locator('[role="option"]')
    .first()
    .evaluate(el => el.getBoundingClientRect().height);
  await expect
    .poll(async () => wheel.evaluate(el => el.scrollTop), {timeout: 5000})
    .toBeGreaterThanOrEqual(scrollTopBefore + row);
  expect(await pageScale(page)).toBe(1);
});
