// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TransferListReorder.a11y.chromium.spec.ts
 * @input The checked-in Lab/TransferList › Default story, a built Storybook and
 *   real Chromium touch input (CDP) on a phone viewport
 * @output Browser evidence that a selected row dragged past the end of its
 *   list stays inside that list, its bottom on the list's end. It never slides
 *   under the next panel's header, and it lands last on release
 * @position Chromium proof for TransferList's selected panel, which reorders
 *   through core's createReorderable on its List (List/listReorderEngine.tsx
 *   clamps the row)
 */

import {
  expect,
  test,
  type CDPSession,
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

test.use({
  hasTouch: true,
  isMobile: true,
  viewport: {width: 390, height: 844},
  deviceScaleFactor: 3,
});

const sleep = async (ms: number) =>
  new Promise(resolve => setTimeout(resolve, ms));

type Point = {x: number; y: number};

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

const GRIP = '[data-transfer-list-row] button[data-astryx-list-reorder]';
// Core List's handle claims a still finger after 150 ms.
const HOLD_MS = 250;

test('a row dragged past the end of its list stays inside it, clear of the next panel', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=lab-transferlist--default&viewMode=story`,
  );
  const grip = page.locator(GRIP).first();
  await expect(grip).toBeVisible();
  const order = async () =>
    page.evaluate(
      selector =>
        Array.from(document.querySelectorAll(selector)).map(
          element =>
            element
              .closest('[data-transfer-list-row]')
              ?.getAttribute('data-transfer-list-row') ?? '',
        ),
      GRIP,
    );
  const before = await order();
  // The dragged row as it shows: during a drag its preview, which follows
  // the finger while the row itself stays dimmed in place.
  const geometry = async () =>
    grip.evaluate(element => {
      const row = element.closest('li') as HTMLElement;
      const list = row.parentElement as HTMLElement;
      const shown =
        list.querySelector<HTMLElement>(
          ':scope > [data-astryx-reorder-preview]',
        ) ?? row;
      const rowBox = shown.getBoundingClientRect();
      const listBox = list.getBoundingClientRect();
      return {
        rowTop: rowBox.top,
        rowBottom: rowBox.bottom,
        listBottom: listBox.bottom,
      };
    });
  const start = await geometry();
  const box = (await grip.boundingBox()) as {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  const from = {x: box.x + box.width / 2, y: box.y + box.height / 2};
  const to = {x: from.x, y: start.listBottom + 200};
  const cdp = await page.context().newCDPSession(page);
  await touch(cdp, 'touchStart', [from]);
  await sleep(HOLD_MS);
  for (let i = 1; i <= 24; i++) {
    await sleep(16);
    await touch(cdp, 'touchMove', [
      {x: from.x, y: from.y + ((to.y - from.y) * i) / 24},
    ]);
  }
  await sleep(150);
  const held = await geometry();
  // The finger is 200 px past the list's end; the preview stopped with its
  // bottom on that end, so none of it hangs under the next panel.
  expect(held.rowTop).toBeGreaterThan(start.rowTop + 40);
  expect(held.rowBottom).toBeLessThanOrEqual(held.listBottom + 0.5);
  expect(held.rowBottom).toBeGreaterThan(held.listBottom - 1);
  await touch(cdp, 'touchEnd', []);
  await sleep(700);
  const after = await order();
  expect(after[after.length - 1]).toBe(before[0]);
});

test('selected rows keep one height and one Remove column, fixed rows included', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=lab-transferlist--locked&viewMode=story`,
  );
  await expect(page.locator(GRIP).first()).toBeVisible();
  const rows = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-transfer-list-row]'))
      .map(row => row.closest('li') as HTMLElement)
      .filter(row =>
        row.closest('ul')?.querySelector('[data-astryx-list-reorder]'),
      )
      .map(row => {
        const remove = Array.from(row.querySelectorAll('button')).find(
          button => !button.hasAttribute('data-astryx-list-reorder'),
        );
        const box = row.getBoundingClientRect();
        const removeBox = remove?.getBoundingClientRect();
        return {
          label: row.textContent?.trim() ?? '',
          height: box.height,
          removeRight: removeBox == null ? null : box.right - removeBox.right,
          removeMiddle:
            removeBox == null
              ? null
              : removeBox.top +
                removeBox.height / 2 -
                (box.top + box.height / 2),
          hasHandle: row.querySelector('[data-astryx-list-reorder]') != null,
        };
      }),
  );
  // Both kinds of row are here: movable ones with a handle, fixed ones without.
  expect(rows.some(row => row.hasHandle)).toBe(true);
  expect(rows.some(row => !row.hasHandle)).toBe(true);
  const [first] = rows;
  for (const row of rows) {
    expect(row.height, row.label).toBeCloseTo(first.height, 0);
    expect(row.removeRight, row.label).toBeCloseTo(first.removeRight ?? 0, 0);
    expect(Math.abs(row.removeMiddle ?? 0), row.label).toBeLessThan(1);
  }
});

test.describe('with a mouse', () => {
  test.use({
    hasTouch: false,
    isMobile: false,
    viewport: {width: 1024, height: 768},
  });

  test('a mouse drags a handle at once and the row lands where it is dropped', async ({
    page,
  }) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=lab-transferlist--default&viewMode=story`,
    );
    // This context's primary pointer is fine: the case is a mouse's.
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(false);
    const grip = page.locator(GRIP).first();
    await expect(grip).toBeVisible();
    const order = async () =>
      page.evaluate(
        selector =>
          Array.from(document.querySelectorAll(selector)).map(
            element =>
              element
                .closest('[data-transfer-list-row]')
                ?.getAttribute('data-transfer-list-row') ?? '',
          ),
        GRIP,
      );
    const before = await order();
    const box = (await grip.boundingBox()) as {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    const pitch = await page.evaluate(selector => {
      const [a, b] = Array.from(document.querySelectorAll(selector)).map(
        element =>
          (element.closest('li') as HTMLElement).getBoundingClientRect().top,
      );
      return b - a;
    }, GRIP);
    const from = {x: box.x + box.width / 2, y: box.y + box.height / 2};
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) {
      await page.mouse.move(from.x, from.y + (1.2 * pitch * i) / 12);
    }
    await page.mouse.up();
    await sleep(300);
    const after = await order();
    // Past the next row's boundary, not the one after: one place down.
    expect(after[1]).toBe(before[0]);
    expect(after[0]).toBe(before[1]);
  });
});
