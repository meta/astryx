// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope core/DropdownMenu

/**
 * @file DropdownMenuDisabledRow.a11y.browser.spec.ts
 * @input The `Core/DropdownMenu` WithDisabledItems story in a built
 *   Storybook, driven by real keyboard input in Chromium and WebKit.
 * @output Real-engine proof that a keyboard open lands on the first enabled
 *   row, that ArrowDown and End reach the disabled row, which takes focus and
 *   is exposed as a disabled menu item, and that Enter and Space on it do
 *   nothing and leave the menu open, and that a mouse press leaves it
 *   unfocused (component:DropdownMenu FR17, DEC-11; useMenuPress FR2).
 * @position Run with `pnpm test:a11y-contract`.
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

async function openMenuFromKeyboard(page: Page): Promise<void> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-dropdownmenu--with-disabled-items&viewMode=story`,
  );
  const trigger = page.getByRole('button', {name: 'Actions'});
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitem', {name: 'Edit'})).toBeFocused();
}

test('the arrow keys reach a disabled row, which is exposed as disabled', async ({
  page,
}) => {
  await openMenuFromKeyboard(page);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  const disabledRow = page.getByRole('menuitem', {
    name: 'Delete (disabled)',
    disabled: true,
  });
  await expect(disabledRow).toBeFocused();

  // ArrowDown wraps past it to the first row; End comes back to it.
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', {name: 'Edit'})).toBeFocused();
  await page.keyboard.press('End');
  await expect(disabledRow).toBeFocused();
});

test('Enter and Space on a disabled row do nothing and leave the menu open', async ({
  page,
}) => {
  await openMenuFromKeyboard(page);
  await page.keyboard.press('End');
  const disabledRow = page.getByRole('menuitem', {name: 'Delete (disabled)'});
  await expect(disabledRow).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press(' ');
  await expect(page.getByRole('menu')).toBeVisible();
  await expect(disabledRow).toBeFocused();
  await expect(page.getByRole('button', {name: 'Actions'})).toHaveAttribute(
    'aria-expanded',
    'true',
  );
});

test('a mouse press on a disabled row leaves it unfocused', async ({page}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-dropdownmenu--with-disabled-items&viewMode=story`,
  );
  await page.getByRole('button', {name: 'Actions'}).click();
  const disabledRow = page.getByRole('menuitem', {name: 'Delete (disabled)'});
  await expect(disabledRow).toBeVisible();
  const box = await disabledRow.boundingBox();
  if (box == null) {
    throw new Error('the disabled row has no box');
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(disabledRow).not.toBeFocused();
  await page.mouse.up();
  await expect(disabledRow).not.toBeFocused();
  await expect(page.getByRole('menu')).toBeVisible();
});
