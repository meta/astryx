// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ListReorderPointer.interaction.browser.spec.ts
 * @input The built List "Reorderable" story in two contexts: one with no
 *   touch screen, so the primary pointer is fine, and the touch phone. A real
 *   mouse and the harness's real engine pen drive it (the pen in Chromium)
 * @output Browser proofs of who drags a row without a hold. A mouse drags a
 *   row from its handle at once. So does a pen where the primary pointer is
 *   fine. A pen where the primary pointer is coarse keeps the hold, as a
 *   finger does. A quick stroke moves nothing, and a held one moves the row.
 *   A row held near a scroll edge scrolls the page, or the box the list
 *   scrolls in, and stops at the end
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

const LONG_STORY = 'core-list--reorder-long-list';

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
async function openFinePointerStory(browser: Browser, story = STORY) {
  const context = await browser.newContext({
    viewport: {width: 800, height: 900},
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  });
  const page = await context.newPage();
  await openStory(page, storybook(), story);
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

test('a row held near the bottom of the page scrolls the page', async ({
  browser,
}) => {
  const story = await openFinePointerStory(browser, LONG_STORY);
  try {
    const {page} = story;
    const order = await labels(page);
    // Item 4: an earlier one's name is a prefix of a later row's.
    const {at} = await handleOf(page, order[3]);
    const bottom = await page.evaluate(() => window.innerHeight);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x, bottom - 4, {steps: 12});
    await expect
      .poll(async () => page.evaluate(() => window.scrollY), {timeout: 3000})
      .toBeGreaterThan(0);
    await page.keyboard.press('Escape');
    await page.mouse.up();
  } finally {
    await story.close();
  }
});

test('a row held at the bottom of the page stops at its end, under the pointer', async ({
  browser,
}) => {
  const story = await openFinePointerStory(browser, LONG_STORY);
  try {
    const {page} = story;
    const order = await labels(page);
    // Item 4: an earlier one's name is a prefix of a later row's.
    const {at} = await handleOf(page, order[3]);
    const viewport = page.viewportSize();
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x, (viewport?.height ?? 0) - 4, {steps: 12});
    // The page scrolls until the list's end is in view, then stops.
    let last = Number.NaN;
    await expect
      .poll(
        async () => {
          const y = await page.evaluate(() => window.scrollY);
          const isStill = y > 0 && y === last;
          last = y;
          return isStill;
        },
        {intervals: [250], timeout: 8000},
      )
      .toBe(true);
    const listBottom = await page.evaluate(
      () =>
        document.querySelector('#storybook-root ul')?.getBoundingClientRect()
          .bottom ?? Number.NaN,
    );
    expect(listBottom).toBeLessThanOrEqual(viewport?.height ?? 0);
    const previewTop = async () =>
      page.evaluate(
        () =>
          document
            .querySelector('[data-astryx-reorder-preview]')
            ?.getBoundingClientRect().top ?? Number.NaN,
      );
    const atEnd = await previewTop();
    await page.waitForTimeout(300);
    // Held at the end, nothing moves: the page stays where it stopped, and
    // the preview stays where the pointer holds it.
    expect(await page.evaluate(() => window.scrollY)).toBe(last);
    expect(Math.abs((await previewTop()) - atEnd)).toBeLessThan(1);
    await page.keyboard.press('Escape');
    await page.mouse.up();
  } finally {
    await story.close();
  }
});

test('a row held near the bottom of a box the list scrolls in scrolls that box, not the page', async ({
  browser,
}) => {
  const story = await openFinePointerStory(browser, LONG_STORY);
  try {
    const {page} = story;
    // The list scrolls in a 400 px box instead of the page.
    const boxBottom = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>('#storybook-root');
      if (root == null) {
        return null;
      }
      root.style.blockSize = '400px';
      root.style.overflowY = 'auto';
      return (
        root.getBoundingClientRect().top + root.clientTop + root.clientHeight
      );
    });
    expect(boxBottom).not.toBeNull();
    const order = await labels(page);
    // Item 4: an earlier one's name is a prefix of a later row's.
    const {at} = await handleOf(page, order[3]);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x, (boxBottom ?? 0) - 4, {steps: 12});
    await expect
      .poll(
        async () =>
          page.evaluate(
            () => document.querySelector('#storybook-root')?.scrollTop ?? 0,
          ),
        {timeout: 3000},
      )
      .toBeGreaterThan(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await page.keyboard.press('Escape');
    await page.mouse.up();
  } finally {
    await story.close();
  }
});

for (const dir of ['ltr', 'rtl'] as const) {
  test(`${dir}: the insertion line runs along the dragged row in a list set in from its container`, async ({
    browser,
  }) => {
    const story = await openFinePointerStory(browser);
    try {
      const {page} = story;
      // The list sits 40 px in from its container, which stays its offset
      // parent until a drag positions the list.
      await page.evaluate(direction => {
        const list = document.querySelector<HTMLElement>('#storybook-root ul');
        if (list != null) {
          list.dir = direction;
          list.style.marginInlineStart = '40px';
        }
      }, dir);
      const before = await labels(page);
      const {at, rowHeight} = await handleOf(page, before[0]);
      await page.mouse.move(at.x, at.y);
      await page.mouse.down();
      await page.mouse.move(at.x, at.y + rowHeight * 1.5, {steps: 8});
      const line = await page.evaluate(() => {
        const list = document.querySelector<HTMLElement>('#storybook-root ul');
        const row = document.querySelector<HTMLElement>(
          '#storybook-root [data-astryx-reorder-source]',
        );
        if (list == null || row == null) {
          return null;
        }
        const after = getComputedStyle(list, '::after');
        const listBox = list.getBoundingClientRect();
        const rowBox = row.getBoundingClientRect();
        const start = parseFloat(after.insetInlineStart);
        const width = parseFloat(after.width);
        // The line's own edges in the viewport, from its inline start.
        const left =
          list.dir === 'rtl'
            ? listBox.right - list.clientLeft - start - width
            : listBox.left + list.clientLeft + start;
        return {
          left,
          right: left + width,
          rowLeft: rowBox.left,
          rowRight: rowBox.right,
        };
      });
      await page.keyboard.press('Escape');
      await page.mouse.up();
      expect(line).not.toBeNull();
      expect(
        Math.abs((line?.left ?? NaN) - (line?.rowLeft ?? NaN)),
      ).toBeLessThan(1);
      expect(
        Math.abs((line?.right ?? NaN) - (line?.rowRight ?? NaN)),
      ).toBeLessThan(1);
    } finally {
      await story.close();
    }
  });
}

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
