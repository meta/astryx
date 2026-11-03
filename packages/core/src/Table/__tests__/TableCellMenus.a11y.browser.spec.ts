// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^packages/core/src/Table/ ^packages/core/src/ContextMenu/ ^apps/storybook/stories/TableRowExpansion

/**
 * @file TableCellMenus.a11y.browser.spec.ts
 * @input Built TableRowExpansion stories in real Chromium and WebKit
 * @output Browser evidence that a cell's context menu adds nothing to the page
 *   until it first opens (a 2,000-row table carries no popover element per
 *   cell), and that the first right-click, keyboard open and long press still
 *   open it as before: at the pointer, at the trigger's corner, or at the
 *   finger, focus moving into it and back, and its close and a second open
 *   unchanged
 * @position Regression proof for ContextMenu mounting its layer at its first
 *   open (row expansion gives every body cell a context menu)
 */

import {expect, test, type Locator, type Page} from '@playwright/test';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';
import {tap, touchDriver} from '@astryxdesign/interaction-harness';

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

async function mount(page: Page, story: string, args = '', timeout = 5000) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-tablerowexpansion--${story}&viewMode=story${args}`,
  );
  await expect(page.locator('[data-expansion-toggle]').first()).toBeVisible({
    timeout,
  });
}

/** A body cell's text, away from its expansion toggle. */
const nameCell = (page: Page) =>
  page.locator('.astryx-table-scroll-wrapper tbody td').nth(1);

/** Marks the element so the test can tell it from a replacement. */
async function mark(locator: Locator) {
  await locator.evaluate(el => {
    (el as unknown as {__marked: boolean}).__marked = true;
  });
}

test('a closed cell menu adds no popover element: none among 2,000 rows', async ({
  page,
}) => {
  // 2,000 rows: a slow runner takes more than the default 5 s to render it.
  await mount(page, 'gliding-rows-long-table', '&args=glide:!false', 30_000);
  // Every body cell carries a context menu (the expansion toggle action).
  expect(
    await page.locator('.astryx-table-scroll-wrapper tbody td').count(),
  ).toBeGreaterThan(9_000);
  expect(
    await page.locator('.astryx-table-scroll-wrapper [popover]').count(),
  ).toBe(0);
});

test('the first right-click opens a cell menu at the pointer', async ({
  page,
}) => {
  await mount(page, 'gliding-rows');
  const box = await nameCell(page).boundingBox();
  if (box == null) {
    throw new Error('the cell has no rendered bounds');
  }
  const point = {x: Math.round(box.x) + 12, y: Math.round(box.y) + 9};
  await page.mouse.click(point.x, point.y, {button: 'right'});
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem')).toHaveCount(1);
  // The menu is anchored to a 1 px box at the pointer.
  const anchor = await nameCell(page)
    .locator('span[aria-hidden="true"][style*="anchor-name"]')
    .boundingBox();
  expect(Math.abs((anchor?.x ?? 0) - point.x)).toBeLessThanOrEqual(1);
  expect(Math.abs((anchor?.y ?? 0) - point.y)).toBeLessThanOrEqual(1);
});

test("a keyboard open on a cell's toggle opens its menu at once, moves focus into it, and Escape hands focus back", async ({
  page,
}) => {
  await mount(page, 'gliding-rows');
  const toggle = page.locator('[data-expansion-toggle]').first();
  await toggle.focus();
  await mark(toggle);
  // Shift+F10 and the Menu key reach the focused element as a contextmenu at
  // (0, 0) with no click count, as several browsers send them.
  await toggle.evaluate(el => {
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
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', {name: 'Expand row'})).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  // The same toggle has focus: the cell's content was not replaced.
  expect(
    await page.evaluate(
      () =>
        (document.activeElement as unknown as {__marked?: boolean} | null)
          ?.__marked === true,
    ),
  ).toBe(true);
});

test('the first close leaves the menu mounted for its exit, and a second open shows the same menu', async ({
  page,
}) => {
  await mount(page, 'gliding-rows');
  const cell = nameCell(page);
  const openLayer = async () =>
    (
      await page.waitForFunction(() =>
        document.querySelector(
          '.astryx-table-scroll-wrapper [popover]:popover-open',
        ),
      )
    ).asElement();
  await cell.click({button: 'right', position: {x: 12, y: 9}});
  const layer = await openLayer();
  if (layer == null) {
    throw new Error('no open menu layer');
  }
  await layer.evaluate(el => {
    (el as unknown as {__marked: boolean}).__marked = true;
  });
  const exit = await layer.evaluate(el => getComputedStyle(el).transition);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toBeHidden();
  // Still in the page, with the transition its close plays.
  expect(await layer.evaluate(el => el.isConnected)).toBe(true);
  expect(await layer.evaluate(el => getComputedStyle(el).transition)).toBe(
    exit,
  );
  await cell.click({button: 'right', position: {x: 20, y: 9}});
  const reopened = await openLayer();
  expect(
    await reopened?.evaluate(
      el => (el as unknown as {__marked?: boolean}).__marked === true,
    ),
  ).toBe(true);
});

test.describe('on a touch screen', () => {
  test.use({hasTouch: true});

  test('the first long press on a cell opens its menu at the finger', async ({
    page,
  }) => {
    await mount(page, 'gliding-rows');
    const cell = nameCell(page);
    const box = await cell.boundingBox();
    if (box == null) {
      throw new Error('the cell has no rendered bounds');
    }
    const point = {x: Math.round(box.x) + 14, y: Math.round(box.y) + 10};
    // A real touch held past the long-press delay, then lifted: the menu
    // opens while the finger is down and stays open as it lifts.
    const driver = await touchDriver(page);
    await driver.play(tap(point, {holdMs: 800}));
    await expect(page.getByRole('menu')).toBeVisible();
    const anchor = await cell
      .locator('span[aria-hidden="true"][style*="anchor-name"]')
      .boundingBox();
    expect(Math.abs((anchor?.x ?? 0) - point.x)).toBeLessThanOrEqual(1);
    expect(Math.abs((anchor?.y ?? 0) - point.y)).toBeLessThanOrEqual(1);
  });
});
