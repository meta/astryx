// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ListReorderPointer.interaction.browser.spec.ts
 * @input The built List "Reorderable" story in two contexts: one with no
 *   touch screen, so the primary pointer is fine, and the touch phone. A real
 *   mouse and the harness's real engine pen drive it (the pen in Chromium)
 * @output Browser proofs of who drags a row without a hold. A mouse drags a
 *   row from its handle at once. So does a pen where the primary pointer is
 *   fine. A pen where the primary pointer is coarse keeps the hold, as a
 *   finger does. A quick stroke moves nothing, and a held one moves the row
 * @position Beside ListReorderTouch.interaction.browser.spec.ts, which proves
 *   the hold under a finger
 */

import {
  expect,
  test,
  type Browser,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  openStory,
  PEN_SKIP,
  webInputDriver,
  withStorybook,
  type PenPoint,
} from '@astryxdesign/interaction-harness';
import {reorder} from '../../motion/uikit/reorder';

const storybook = withStorybook(test);

const STORY = 'core-list--reorderable';

/** Past the claim delay: the hold claims the drag. */
const HOLD_MS = reorder.claim.delayMs + 150;

/** The story's row labels, in order. */
async function labels(page: Page): Promise<string[]> {
  return page
    .locator('#storybook-root li:not([data-astryx-leaving])')
    .evaluateAll(rows => rows.map(row => row.textContent?.trim() ?? ''));
}

/** The centre of `label`'s handle and the height of its row. */
async function handleOf(page: Page, label: string) {
  const handle = page.getByRole('button', {name: `Reorder ${label}`});
  await expect(handle).toBeVisible();
  const box = await handle.boundingBox();
  const row = await handle
    .locator('xpath=ancestor::li[1]')
    .evaluate(element => element.getBoundingClientRect().height);
  if (box == null) {
    throw new Error(`no handle for ${label}`);
  }
  return {
    at: {x: box.x + box.width / 2, y: box.y + box.height / 2},
    rowHeight: row,
  };
}

/** The first row moved two places down: the order a two-row drag commits. */
function movedTwoDown(order: ReadonlyArray<string>): string[] {
  return [order[1], order[2], order[0], ...order.slice(3)];
}

/**
 * The story in a context with no touch screen, so the primary pointer is
 * fine. Contexts made here inherit the project's phone options unless they
 * are named.
 */
async function openFinePointerStory(browser: Browser) {
  const context = await browser.newContext({
    viewport: {width: 800, height: 900},
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  });
  const page = await context.newPage();
  await openStory(page, storybook(), STORY);
  expect(
    await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
  ).toBe(false);
  return {page, close: async () => context.close()};
}

/** A stroke from `at` straight down `distance`, a point every 16 ms. */
function strokeDown(
  at: {x: number; y: number},
  distance: number,
  startMs = 0,
): PenPoint[] {
  const steps = 16;
  return Array.from({length: steps + 1}, (_, step) => ({
    x: at.x,
    y: at.y + (distance * step) / steps,
    t: startMs + step * 16,
  }));
}

test('a mouse drags a row from its handle at once, where the primary pointer is fine', async ({
  browser,
}) => {
  const story = await openFinePointerStory(browser);
  try {
    const {page} = story;
    const before = await labels(page);
    expect(before.length).toBeGreaterThanOrEqual(3);
    const {at, rowHeight} = await handleOf(page, before[0]);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x, at.y + rowHeight * 2.5, {steps: 12});
    await page.mouse.up();
    await expect.poll(async () => labels(page)).toEqual(movedTwoDown(before));
  } finally {
    await story.close();
  }
});

test('a pen drags a row from its handle at once, as a mouse does, where the primary pointer is fine', async ({
  browser,
}) => {
  const story = await openFinePointerStory(browser);
  try {
    const {page} = story;
    const driver = await webInputDriver(page);
    test.skip(!driver.pens, PEN_SKIP);
    const before = await labels(page);
    expect(before.length).toBeGreaterThanOrEqual(3);
    const {at, rowHeight} = await handleOf(page, before[0]);
    await driver.pen(strokeDown(at, rowHeight * 2.5));
    await expect.poll(async () => labels(page)).toEqual(movedTwoDown(before));
  } finally {
    await story.close();
  }
});

test('a pen keeps the hold where the primary pointer is coarse: a quick stroke moves nothing, and a held one moves the row', async ({
  page,
}) => {
  await openStory(page, storybook(), STORY);
  expect(
    await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
  ).toBe(true);
  const driver = await webInputDriver(page);
  test.skip(!driver.pens, PEN_SKIP);
  const before = await labels(page);
  expect(before.length).toBeGreaterThanOrEqual(3);
  const {at, rowHeight} = await handleOf(page, before[0]);
  await driver.pen(strokeDown(at, rowHeight * 2.5));
  await page.waitForTimeout(300);
  expect(await labels(page)).toEqual(before);
  // The same stroke, after the pen rests on the handle past the claim delay.
  await driver.pen([
    {x: at.x, y: at.y, t: 0},
    ...strokeDown(at, rowHeight * 2.5, HOLD_MS),
  ]);
  await expect.poll(async () => labels(page)).toEqual(movedTwoDown(before));
});
