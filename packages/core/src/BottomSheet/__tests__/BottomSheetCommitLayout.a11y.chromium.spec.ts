// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope core/DateInput

/**
 * @file BottomSheetCommitLayout.a11y.chromium.spec.ts
 * @input Built stories, real Chromium touch input, and a count of the page's
 *   reads of `window.innerHeight`
 * @output Browser evidence that a tap that renders an open sheet again reads
 *   no `innerHeight`, so its commit forces no style recalculation or layout
 *   for it. That holds for the month and year toggle in DateInput's sheet and
 *   for a checkbox in a BottomSheet. A control proves that the count sees a
 *   read in a tap.
 * @position Chromium proof for BottomSheetPanel's viewport height. The sheet
 *   renders from the height its resize listener keeps.
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
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

test.use({hasTouch: true, isMobile: true, viewport: {width: 390, height: 844}});

interface ReadCounter {
  isCounting: boolean;
  reads: number;
}

test.beforeEach(async ({page}) => {
  // Counts reads of `innerHeight` while `isCounting` is set. After a commit's
  // DOM writes, such a read forces a style recalculation and a layout.
  await page.addInitScript(() => {
    const counter = {isCounting: false, reads: 0};
    Object.assign(window, {innerHeightReads: counter});
    const descriptor = Object.getOwnPropertyDescriptor(window, 'innerHeight');
    const read = descriptor?.get;
    if (read == null) {
      throw new Error('innerHeight has no getter');
    }
    Object.defineProperty(window, 'innerHeight', {
      ...descriptor,
      get(this: Window): number {
        if (counter.isCounting) {
          counter.reads += 1;
        }
        return read.call(this) as number;
      },
    });
  });
});

/**
 * Taps `target` with a real touch and returns the reads of `innerHeight` from
 * the tap to two frames after it.
 */
async function innerHeightReadsInTap(
  page: Page,
  target: Locator,
): Promise<number> {
  const box = await target.boundingBox();
  if (box == null) {
    throw new Error('no target box');
  }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.evaluate(() => {
    const counter = (window as unknown as {innerHeightReads: ReadCounter})
      .innerHeightReads;
    counter.reads = 0;
    counter.isCounting = true;
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{x, y}],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await cdp.detach();
  return page.evaluate(async () => {
    await new Promise(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
    const counter = (window as unknown as {innerHeightReads: ReadCounter})
      .innerHeightReads;
    counter.isCounting = false;
    return counter.reads;
  });
}

/** Waits until nothing animates on the page. */
async function waitForStill(page: Page): Promise<void> {
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          document
            .getAnimations()
            .filter(animation => animation.playState === 'running').length,
      ),
    )
    .toBe(0);
}

async function openDateSheet(page: Page): Promise<Locator> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-dateinput--bottom-sheet-wide-range&viewMode=story`,
  );
  await page.getByRole('combobox', {name: 'Date of birth'}).tap();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const toggle = dialog.locator('button[data-title="month-year"]');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await waitForStill(page);
  return toggle;
}

test("the month and year toggle in DateInput's sheet reads no innerHeight in its tap", async ({
  page,
}) => {
  const toggle = await openDateSheet(page);
  const reads = await innerHeightReadsInTap(page, toggle);
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(reads).toBe(0);
});

test("a checkbox in a BottomSheet's content reads no innerHeight in its tap", async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-bottomsheet--showcase&viewMode=story`,
  );
  await page.getByRole('button', {name: 'Open sheet'}).tap();
  const dialog = page.getByRole('dialog', {name: 'Filters'});
  await expect(dialog).toBeVisible();
  await waitForStill(page);
  const checkbox = dialog.getByRole('checkbox', {name: 'In stock'});
  await expect(checkbox).not.toBeChecked();
  const reads = await innerHeightReadsInTap(page, checkbox);
  await expect(checkbox).toBeChecked();
  expect(reads).toBe(0);
});

test('the count sees a read of innerHeight in a tap', async ({page}) => {
  const toggle = await openDateSheet(page);
  // The control: the tap's own click reads the height once.
  await page.evaluate(() => {
    document.addEventListener(
      'click',
      () => {
        void window.innerHeight;
      },
      {capture: true, once: true},
    );
  });
  const reads = await innerHeightReadsInTap(page, toggle);
  expect(reads).toBeGreaterThanOrEqual(1);
});
