// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file ContextMenuCursorAnchor.a11y.browser.spec.ts
 * @input The built "Inside a scroll container" ContextMenu story and real
 *   Chromium/WebKit layout and paint
 * @output Browser evidence that the menu paints at its cursor anchor inside a
 *   scroll container, hides while the container clips that anchor, and that
 *   the anchor adds no scrollable overflow
 * @position Cross-browser proof; jsdom has no layout, anchor positioning or
 *   paint.
 *
 * The menu is anchored to a box at the pointer. The initial
 * `position-visibility: anchors-visible` hides an anchored box whose anchor
 * is clipped, and WebKit counts an empty anchor box inside a scroll container
 * as clipped. Whether the menu painted is read from pixels: WebKit still
 * hit-tests, and reports as visible, a box that rule hides.
 */

import {expect, test, type Locator, type Page} from '@playwright/test';
import {holdMotionStill} from '@astryxdesign/a11y-spec/chromium';
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

/** Mounts the story with the trigger scrolled fully into the box. */
async function mount(
  page: Page,
): Promise<{trigger: Locator; scroller: Locator}> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-contextmenu--in-scroll-container&viewMode=story`,
  );
  await holdMotionStill(page);
  const scroller = page.getByTestId('context-menu-scroller');
  // The trigger is the box's last child: at the end of the scroll its bottom
  // edge is the box's bottom edge.
  await scroller.evaluate(el => {
    el.scrollTop = el.scrollHeight;
  });
  return {trigger: page.getByText('Right-click this area'), scroller};
}

/** Right-clicks the trigger 40px in and 30px down; returns that point. */
async function rightClick(
  page: Page,
  trigger: Locator,
): Promise<{x: number; y: number}> {
  const box = await trigger.boundingBox();
  const point = {
    x: Math.round(box?.x ?? 0) + 40,
    y: Math.round(box?.y ?? 0) + 30,
  };
  await page.mouse.click(point.x, point.y, {button: 'right'});
  return point;
}

/** Whether the open menu is on screen: hiding it must change the pixels. */
async function menuPainted(page: Page): Promise<boolean> {
  const layer = page.locator('[popover]:has(> [role="menu"])');
  const clip = await layer.boundingBox();
  if (clip == null) {
    return false;
  }
  const shown = await page.screenshot({clip});
  await layer.evaluate(el => {
    el.style.visibility = 'hidden';
  });
  const hidden = await page.screenshot({clip});
  await layer.evaluate(el => {
    el.style.visibility = '';
  });
  return !shown.equals(hidden);
}

test('a right-click inside a scroll container paints the menu at the pointer', async ({
  page,
}) => {
  const {trigger} = await mount(page);
  const point = await rightClick(page, trigger);
  await expect(page.getByRole('menu')).toBeVisible();
  await expect.poll(async () => menuPainted(page)).toBe(true);

  const anchor = await page
    .locator('span[aria-hidden="true"][style*="anchor-name"]')
    .boundingBox();
  // The anchor owns a box, so WebKit does not count it as clipped.
  expect(anchor).toMatchObject({width: 1, height: 1});
  expect(anchor?.x).toBeCloseTo(point.x, 0);
  expect(anchor?.y).toBeCloseTo(point.y, 0);
});

test('the menu hides while the box scrolls its anchor out of view, and returns with it', async ({
  page,
}) => {
  const {trigger, scroller} = await mount(page);
  await rightClick(page, trigger);
  await expect(page.getByRole('menu')).toBeVisible();
  await expect.poll(async () => menuPainted(page)).toBe(true);

  await scroller.evaluate(el => {
    el.scrollTop -= el.clientHeight;
  });
  await expect(page.getByRole('menu')).toBeAttached();
  await expect.poll(async () => menuPainted(page)).toBe(false);

  await scroller.evaluate(el => {
    el.scrollTop = el.scrollHeight;
  });
  await expect.poll(async () => menuPainted(page)).toBe(true);
});

test('a keyboard open on the bottom edge paints and adds no scrollable overflow', async ({
  page,
}) => {
  const {trigger, scroller} = await mount(page);
  const scrollHeight = await scroller.evaluate(el => el.scrollHeight);
  // Several browsers report Shift+F10 as a contextmenu at (0, 0), which
  // anchors the menu to the trigger's bottom edge, here the box's own edge.
  await trigger.evaluate(el => {
    el.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 0,
        clientY: 0,
        detail: 0,
      }),
    );
  });
  await expect(page.getByRole('menu')).toBeVisible();
  const anchor = await page
    .locator('span[aria-hidden="true"][style*="anchor-name"]')
    .boundingBox();
  const area = await trigger.boundingBox();
  expect((anchor?.y ?? 0) + (anchor?.height ?? 0)).toBeCloseTo(
    (area?.y ?? 0) + (area?.height ?? 0),
    0,
  );
  await expect.poll(async () => menuPainted(page)).toBe(true);
  expect(await scroller.evaluate(el => el.scrollHeight)).toBe(scrollHeight);
});
