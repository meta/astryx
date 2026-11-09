// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TransferListReorder.a11y.chromium.spec.ts
 * @input The checked-in Lab/TransferList › Default story, a built Storybook and
 *   real Chromium touch input (CDP) on a phone viewport. The A11y/TransferList
 *   › Disabled fixture, with a mouse and keys
 * @output Browser evidence that a selected row dragged past the end of its
 *   list stays inside that list, its bottom on the list's end. It never slides
 *   under the next panel's header, and it lands last on release. In the phone
 *   layout the panels do not clip; at a desktop width they do. A disabled
 *   list keeps each handle focusable and disabled, with the focus where it was
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
  // The finger is 200 px past the list's end. The preview stopped with its
  // bottom on that end, so none of it hangs under the next panel.
  expect(held.rowTop).toBeGreaterThan(start.rowTop + 40);
  expect(held.rowBottom).toBeLessThanOrEqual(held.listBottom + 0.5);
  expect(held.rowBottom).toBeGreaterThan(held.listBottom - 1);
  await touch(cdp, 'touchEnd', []);
  await sleep(700);
  const after = await order();
  expect(after[after.length - 1]).toBe(before[0]);
});

test('the panels clip nothing in the phone layout, and clip at a desktop width', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=lab-transferlist--default&viewMode=story`,
  );
  await expect(page.locator(GRIP).first()).toBeVisible();
  const overflows = async () =>
    page
      .locator('[role="group"][data-side]')
      .evaluateAll(panels =>
        panels.map(panel => getComputedStyle(panel).overflow),
      );
  expect(await overflows()).toEqual(['visible', 'visible']);
  await page.setViewportSize({width: 1024, height: 768});
  await expect.poll(overflows).toEqual(['hidden', 'hidden']);
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

test.describe('a disabled list', () => {
  test.use({
    hasTouch: false,
    isMobile: false,
    viewport: {width: 1024, height: 768},
    deviceScaleFactor: 1,
  });

  test('dims a disabled row once: its label, Remove and handle at half opacity', async ({
    page,
  }) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=a11y-transferlist--disabled&viewMode=story`,
    );
    await page.getByRole('switch', {name: 'Disable the list'}).click();
    const row = page.locator('[data-transfer-list-row="owner"]');
    const handle = 'button[data-astryx-list-reorder]';
    await expect(row.locator(handle)).toHaveAttribute('aria-disabled', 'true');
    // The opacity a reader sees: the product of the element's own and its
    // ancestors' opacity, up to the row.
    const seen = async (selector: string) =>
      row
        .locator(selector)
        .first()
        .evaluate(element => {
          let opacity = 1;
          for (
            let node: Element | null = element;
            node != null && !node.matches('[data-transfer-list-row]');
            node = node.parentElement
          ) {
            opacity *= Number(getComputedStyle(node).opacity);
          }
          return Math.round(opacity * 100) / 100;
        });
    await expect.poll(() => seen('text=Owner')).toBe(0.5);
    await expect
      .poll(() => seen('[data-transfer-list-action="selected"]'))
      .toBe(0.5);
    await expect.poll(() => seen(handle)).toBe(0.5);
  });

  test('keeps each reorder handle focusable and disabled, with the focus where it was', async ({
    page,
  }) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=a11y-transferlist--disabled&viewMode=story`,
    );
    const handle = page.getByRole('button', {name: 'Reorder Owner'});
    await expect(handle).toBeVisible();
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
    await handle.focus();
    // The switch is clicked from script, so the focus stays on the handle.
    await page
      .getByRole('switch', {name: 'Disable the list'})
      .evaluate(element => (element as HTMLElement).click());
    await expect(page.locator(GRIP)).toHaveCount(before.length);
    for (const each of await page.locator(GRIP).all()) {
      await expect(each).toHaveAttribute('aria-disabled', 'true');
    }
    await expect(handle).toBeFocused();
    // A tooltip shows after a short delay. None opens, since the focus stays.
    await sleep(800);
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    // A key or a drag on a disabled handle changes nothing.
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown');
    await expect(handle).toHaveAttribute('aria-pressed', 'false');
    const box = (await handle.boundingBox()) as {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + 120, {steps: 8});
    await page.mouse.up();
    await sleep(300);
    expect(await order()).toEqual(before);
    // The handle says why the row does not move. Its description and a
    // tooltip on hover and on keyboard focus give the reason.
    const why = page
      .getByRole('tooltip')
      .filter({hasText: 'Owner cannot be reordered'});
    await expect(handle).toHaveAccessibleDescription(
      /Owner cannot be reordered/,
    );
    await page.mouse.move(0, 0);
    await expect(why).toHaveCount(0);
    await handle.hover();
    await expect(why).toBeVisible();
    await page.mouse.move(0, 0);
    await expect(why).toHaveCount(0);
    // The handle stays in the tab order.
    await handle.focus();
    await page.keyboard.press('Shift+Tab');
    await expect(handle).not.toBeFocused();
    await page.keyboard.press('Tab');
    await expect(handle).toBeFocused();
    await expect(why).toBeVisible();
  });
});
