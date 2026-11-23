// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DropdownMenuPickTapThrough.interaction.browser.spec.ts
 * @input The built Submenu and SubmenuRadioGroup DropdownMenu stories on a
 *   phone, real touch input (Chromium CDP, WebKit's tap path) and the
 *   interaction harness
 * @output A finger's pick in a submenu closes the menu and takes its row out
 *   of the document before the touch's touchend. The touchend is still
 *   cancelled, and no mouse event or click reaches the control beneath the
 *   finger. That holds also when a busy main thread delays the touchend past
 *   the click guard's window.
 * @position Real-engine proof for module:DropdownMenu/useMenuPress and the
 *   click guard (overlay-dismissal FR11); the jsdom half is
 *   ../DropdownMenuPickTouchEnd.test.tsx
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  openStory,
  touchDriver,
  withStorybook,
  type TouchDriver,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

/** Longer than the click guard's 400 ms window. */
const BUSY_MS = 600;

async function center(locator: Locator): Promise<{x: number; y: number}> {
  const box = await locator.boundingBox();
  if (box == null) {
    throw new Error('center: the element has no box');
  }
  // WebKit's touch command takes whole pixels.
  return {
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2),
  };
}

/** Opens the menu and its submenu with a finger, as on a phone. */
async function openSubmenu(
  page: Page,
  storyId: string,
  triggerName: string,
  submenuName: string,
): Promise<{driver: TouchDriver; trigger: Locator}> {
  await openStory(page, storybook(), storyId);
  const driver = await touchDriver(page);
  const trigger = page.getByRole('button', {name: triggerName}).first();
  await driver.tap(await center(trigger));
  const submenu = page.getByRole('menuitem', {name: submenuName});
  await expect(submenu).toBeVisible();
  // Past the entrance, whose hold would take the next tap.
  await page.waitForTimeout(600);
  await driver.tap(await center(submenu));
  return {driver, trigger};
}

/**
 * Covers the page with a control below the menu's top layer, which logs the
 * mouse events and click that the browser sends it. Also logs whether the
 * touchend that reaches `row` was cancelled, once every listener has run.
 */
async function watchPick(page: Page, row: Locator): Promise<void> {
  await row.evaluate(element => {
    const log: string[] = [];
    (window as unknown as {pickLog: string[]}).pickLog = log;
    element.addEventListener('touchend', event => {
      queueMicrotask(() => {
        log.push(
          event.defaultPrevented
            ? 'touchend cancelled'
            : 'touchend not cancelled',
        );
      });
    });
    const beneath = document.createElement('button');
    beneath.type = 'button';
    beneath.setAttribute('aria-label', 'Beneath');
    beneath.style.cssText =
      'position:fixed;inset:0;margin:0;padding:0;border:0;background:transparent;z-index:2147483647';
    for (const type of ['mousedown', 'mouseup', 'click']) {
      beneath.addEventListener(type, event => {
        if (event.isTrusted) {
          log.push(`beneath ${type}`);
        }
      });
    }
    document.body.append(beneath);
  });
}

/**
 * Holds the main thread for `ms`, once, after the menu has handled the next
 * pointerup: a long task between the touch's pointerup and its touchend.
 */
async function busyAfterNextPointerUp(page: Page, ms: number): Promise<void> {
  await page.evaluate(duration => {
    window.addEventListener(
      'pointerup',
      () => {
        const end = performance.now() + duration;
        while (performance.now() < end) {
          // Spin: the page's own long task.
        }
      },
      {once: true},
    );
  }, ms);
}

async function pickLog(page: Page): Promise<string[]> {
  return page.evaluate(
    () => (window as unknown as {pickLog: string[]}).pickLog,
  );
}

test.describe("a finger's pick in a submenu (overlay-dismissal FR11)", () => {
  test('cancels its touchend, and no click reaches the control beneath', async ({
    page,
  }) => {
    const {driver, trigger} = await openSubmenu(
      page,
      'core-dropdownmenu--submenu',
      'Actions',
      'Move to',
    );
    const row = page.getByRole('menuitem', {name: 'Folder C'});
    await expect(row).toBeVisible();
    await page.waitForTimeout(600);
    await watchPick(page, row);
    await driver.tap(await center(row));
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await page.waitForTimeout(BUSY_MS + 400);
    expect(await pickLog(page)).toEqual(['touchend cancelled']);
  });

  test("cancels its touchend, and no click reaches the control beneath, when a busy main thread delays the touchend past the click guard's window", async ({
    page,
  }) => {
    const {driver, trigger} = await openSubmenu(
      page,
      'core-dropdownmenu--submenu',
      'Actions',
      'Move to',
    );
    const row = page.getByRole('menuitem', {name: 'Folder C'});
    await expect(row).toBeVisible();
    await page.waitForTimeout(600);
    await watchPick(page, row);
    await busyAfterNextPointerUp(page, BUSY_MS);
    await driver.tap(await center(row));
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await page.waitForTimeout(BUSY_MS + 400);
    expect(await pickLog(page)).toEqual(['touchend cancelled']);
  });

  test("on a radio item, cancels its touchend, and no click reaches the control beneath, when a busy main thread delays the touchend past the click guard's window", async ({
    page,
  }) => {
    const {driver, trigger} = await openSubmenu(
      page,
      'core-dropdownmenu--submenu-radio-group',
      'View',
      'Sort by',
    );
    const row = page.getByRole('menuitemradio', {name: 'Oldest'});
    await expect(row).toBeVisible();
    await page.waitForTimeout(600);
    await watchPick(page, row);
    await busyAfterNextPointerUp(page, BUSY_MS);
    await driver.tap(await center(row));
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await page.waitForTimeout(BUSY_MS + 400);
    expect(await pickLog(page)).toEqual(['touchend cancelled']);
  });
});
