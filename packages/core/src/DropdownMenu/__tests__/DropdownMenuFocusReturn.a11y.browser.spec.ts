// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file DropdownMenuFocusReturn.a11y.browser.spec.ts
 * @input The `Core/DropdownMenu` CustomTrigger story (an icon button the
 *   caller renders) in a built Storybook, real Chromium/WebKit pointer and
 *   keyboard input.
 * @output Browser evidence that the focus the menu returns to a trigger the
 *   caller renders follows the last input
 *   (docs/architecture/interaction-modality.md INV1,
 *   `component:DropdownMenu/DEC-1`): no ring after a pointer pick, the ring
 *   after a keyboard pick.
 * @position Cross-browser proof; jsdom only proves which focus call the menu
 *   makes. Unless the menu asks for no ring, both engines ring the focus it
 *   returns after a pointer pick.
 */

import {expect, test, type Locator, type Page} from '@playwright/test';
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

async function mount(page: Page): Promise<Locator> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-dropdownmenu--custom-trigger&viewMode=story`,
  );
  const trigger = page.getByRole('button', {name: 'More actions'});
  await expect(trigger).toBeVisible();
  return trigger;
}

async function matchesFocusVisible(locator: Locator): Promise<boolean> {
  return locator.evaluate(element => element.matches(':focus-visible'));
}

test('a pointer pick returns focus to the trigger without a ring', async ({
  page,
}) => {
  const trigger = await mount(page);
  await trigger.click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await page.getByRole('menuitem', {name: 'Rename'}).click();
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(await matchesFocusVisible(trigger)).toBe(false);
});

test('a keyboard pick returns focus to the trigger with its ring', async ({
  page,
}) => {
  const trigger = await mount(page);
  await trigger.focus();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('menu');
  await expect(page.getByRole('menuitem', {name: 'Rename'})).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(await matchesFocusVisible(trigger)).toBe(true);
});
