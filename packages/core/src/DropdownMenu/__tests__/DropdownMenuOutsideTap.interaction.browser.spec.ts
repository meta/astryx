// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DropdownMenuOutsideTap.interaction.browser.spec.ts
 * @input The built Submenu DropdownMenu story on a phone, real touch input
 *   (Chromium CDP, WebKit's tap path), a mouse, and the interaction harness
 * @output A finger's tap outside the open menu closes it. The control under
 *   the finger hears no pointer, touch or mouse event, and no click. A pan
 *   outside closes the menu as it begins, and the page still
 *   scrolls. A mouse's click outside closes the menu and keeps its events.
 * @position Real-engine half of ../DropdownMenuOutsideTap.test.tsx
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
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

const STORY = 'core-dropdownmenu--submenu';

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

/**
 * Adds a control in the page's bottom corner, outside the menu, that logs
 * each pointer, touch and mouse event and each click that reaches it. With
 * `scrolls`, it also adds a spacer that lets the page scroll.
 */
async function addControlBeneath(
  page: Page,
  {scrolls = false} = {},
): Promise<Locator> {
  await page.evaluate(hasSpacer => {
    const log: string[] = [];
    (window as unknown as {outsideLog: string[]}).outsideLog = log;
    if (hasSpacer) {
      const spacer = document.createElement('div');
      spacer.style.cssText = 'height:3000px';
      document.body.append(spacer);
    }
    const control = document.createElement('button');
    control.type = 'button';
    control.textContent = 'Beneath';
    control.style.cssText =
      'position:fixed;right:8px;bottom:8px;width:120px;height:120px;margin:0';
    for (const type of [
      'pointerdown',
      'pointerup',
      'touchstart',
      'touchend',
      'mousedown',
      'mouseup',
      'click',
    ]) {
      control.addEventListener(type, event => {
        if (event.isTrusted) {
          log.push(`beneath ${type}`);
        }
      });
    }
    document.body.append(control);
  }, scrolls);
  return page.getByRole('button', {name: 'Beneath'});
}

async function outsideLog(page: Page): Promise<string[]> {
  return page.evaluate(
    () => (window as unknown as {outsideLog: string[]}).outsideLog,
  );
}

/** Opens the menu with a finger, then adds the control beneath it. */
async function openWithFinger(page: Page, {scrolls = false} = {}) {
  await openStory(page, storybook(), STORY);
  const driver = await touchDriver(page);
  const trigger = page.getByRole('button', {name: 'Actions'}).first();
  await driver.tap(await center(trigger));
  await expect(page.getByRole('menuitem', {name: 'Move to'})).toBeVisible();
  // Past the entrance, whose hold would take the next touch.
  await page.waitForTimeout(600);
  const beneath = await addControlBeneath(page, {scrolls});
  return {beneath, driver, trigger};
}

test.describe('a touch outside the open menu (spec:AST-094 FR32)', () => {
  test("a finger's tap closes the menu, and the control beneath hears nothing", async ({
    page,
  }) => {
    const {beneath, driver, trigger} = await openWithFinger(page);
    await driver.tap(await center(beneath));
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await page.waitForTimeout(800);
    expect(await outsideLog(page)).toEqual([]);
  });

  test('a pan closes the menu as it begins, the page scrolls, and the control beneath hears nothing', async ({
    page,
  }) => {
    const {beneath, driver, trigger} = await openWithFinger(page, {
      scrolls: true,
    });
    const start = await center(beneath);
    const finger = await driver.press(start);
    for (let step = 1; step <= 8; step += 1) {
      await finger.move({x: start.x, y: start.y - step * 20});
    }
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await finger.lift();
    await page.waitForTimeout(800);
    expect(await outsideLog(page)).toEqual([]);
    if (driver.drivesNativeGestures) {
      expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    }
  });

  test("a mouse's click closes the menu and keeps its events", async ({
    page,
  }) => {
    await openStory(page, storybook(), STORY);
    const beneath = await addControlBeneath(page);
    const trigger = page.getByRole('button', {name: 'Actions'}).first();
    await trigger.click();
    await expect(page.getByRole('menuitem', {name: 'Move to'})).toBeVisible();
    await page.waitForTimeout(600);
    await beneath.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(await outsideLog(page)).toEqual([
      'beneath pointerdown',
      'beneath mousedown',
      'beneath pointerup',
      'beneath mouseup',
      'beneath click',
    ]);
  });
});
