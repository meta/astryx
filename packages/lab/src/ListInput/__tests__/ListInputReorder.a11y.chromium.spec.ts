// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ListInputReorder.a11y.chromium.spec.ts
 * @input The checked-in Lab/ListInput › Tag Options story, a built Storybook,
 *   real Chromium touch input (CDP) and keys on a phone viewport
 * @output Browser evidence that on a touch screen a keyboard move slides the
 *   records it swaps rather than jumping them in one frame. UIKit's motion is
 *   the same on every touch screen. With a mouse, the records take their
 *   places without travel. Reorder mode marks the record with the list's
 *   insertion line, and stays on through each move
 * @position Chromium proof for ListInput's reorder, which runs on core List's
 *   reorder session (List/ListReorderScope.tsx)
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
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

test.use({
  hasTouch: true,
  isMobile: true,
  viewport: {width: 390, height: 844},
  deviceScaleFactor: 3,
});

const sleep = async (ms: number) =>
  new Promise(resolve => setTimeout(resolve, ms));

const HANDLE = '[data-list-input-row] button[data-astryx-list-reorder]';

/** Records whose row (the record's <li>) is moving in the next frame. */
async function movingRecords(page: Page) {
  return page.evaluate(
    async () =>
      new Promise<number>(resolve =>
        requestAnimationFrame(() =>
          resolve(
            Array.from(document.querySelectorAll('[data-list-input-row]'))
              .map(record => record.closest('li'))
              .filter(
                (row): row is HTMLLIElement =>
                  row != null &&
                  row
                    .getAnimations()
                    .some(animation => animation.playState === 'running'),
              ).length,
          ),
        ),
      ),
  );
}
const STORY = 'lab-listinput--tag-options';

test('on a touch screen a keyboard move slides the two records it swaps', async ({
  page,
}) => {
  await page.goto(`${storybook.origin}/iframe.html?id=${STORY}&viewMode=story`);
  const handle = page.locator(HANDLE).first();
  await expect(handle).toBeVisible();
  await handle.scrollIntoViewIfNeeded();
  const order = async () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-list-input-row]')).map(row =>
        row.getAttribute('data-list-input-row'),
      ),
    );
  const before = await order();
  await page.keyboard.press('Shift');
  await handle.focus();
  // Enter turns on reorder mode; each arrow then moves the record a place.
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  const moving = await movingRecords(page);
  expect(moving).toBeGreaterThanOrEqual(2);
  await sleep(600);
  const after = await order();
  expect(after[1]).toBe(before[0]);
  expect(after[0]).toBe(before[1]);
});

/**
 * The list's insertion line, its own ::after. It tells whether the list is
 * painted, whether the line shows, and the line's top in the page.
 */
async function insertionLine(page: Page) {
  return page.evaluate(() => {
    const list = document
      .querySelector('[data-list-input-row]')
      ?.closest<HTMLElement>('ol');
    if (list == null) {
      return null;
    }
    const box = list.getBoundingClientRect();
    const line = getComputedStyle(list, '::after');
    const lineY = parseFloat(line.translate.split(' ')[1] ?? '');
    return {
      isPainted: box.width > 0 && box.height > 0,
      isShown: line.content !== 'none' && line.display !== 'none',
      top: box.top + list.clientTop + lineY,
    };
  });
}

/** The top of the record with `key` in the page. */
async function recordTop(page: Page, key: string | null) {
  return page.evaluate(
    k =>
      document
        .querySelector(`[data-list-input-row="${k}"]`)
        ?.closest('li')
        ?.getBoundingClientRect().top ?? Number.NaN,
    key,
  );
}

test.describe('with a mouse', () => {
  test.use({hasTouch: false, isMobile: false});

  test('a keyboard move takes its place without travel', async ({page}) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=${STORY}&viewMode=story`,
    );
    const handle = page.locator(HANDLE).first();
    await expect(handle).toBeVisible();
    await handle.scrollIntoViewIfNeeded();
    const coarse = await page.evaluate(
      () => matchMedia('(pointer: coarse)').matches,
    );
    expect(coarse).toBe(false);
    await page.keyboard.press('Shift');
    await handle.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown');
    expect(await movingRecords(page)).toBe(0);
  });

  test('reorder mode marks the record with the insertion line through each move', async ({
    page,
  }) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=${STORY}&viewMode=story`,
    );
    const first = page.locator(HANDLE).first();
    await expect(first).toBeVisible();
    await first.scrollIntoViewIfNeeded();
    const key = await page
      .locator('[data-list-input-row]')
      .first()
      .getAttribute('data-list-input-row');
    const handle = page.locator(
      `[data-list-input-row="${key}"] button[data-astryx-list-reorder]`,
    );
    const before = await insertionLine(page);
    expect(before?.isPainted).toBe(true);
    expect(before?.isShown).toBe(false);
    await page.keyboard.press('Shift');
    await handle.focus();
    await page.keyboard.press('Enter');
    await expect(handle).toHaveAttribute('aria-pressed', 'true');
    // The line marks the record's place from the start of the mode.
    await expect
      .poll(async () => (await insertionLine(page))?.isShown)
      .toBe(true);
    for (const press of ['ArrowDown', 'ArrowUp']) {
      await page.keyboard.press(press);
      await expect(handle).toHaveAttribute('aria-pressed', 'true');
      await expect
        .poll(async () => (await insertionLine(page))?.isShown)
        .toBe(true);
    }
    // Back at the top: the line sits at the record's top edge.
    const line = await insertionLine(page);
    expect(
      Math.abs((line?.top ?? Number.NaN) - (await recordTop(page, key))),
    ).toBeLessThan(6);
  });
});
