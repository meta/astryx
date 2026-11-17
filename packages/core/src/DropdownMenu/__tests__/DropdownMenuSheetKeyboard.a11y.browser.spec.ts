// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DropdownMenuSheetKeyboard.a11y.browser.spec.ts
 * @input The action-sheet custom-trigger story and real Chromium keyboard input
 * @output Browser evidence that ArrowDown and ArrowUp open a bottom-sheet menu at the matching action edge
 * @position Browser regression for component:DropdownMenu AR4
 */

import {expect, test} from '@astryxdesign/a11y-spec/playwright';
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

test('ArrowDown and ArrowUp open the bottom sheet at opposite action edges', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-dropdownmenu--action-sheet-custom-trigger&viewMode=story`,
    {waitUntil: 'load'},
  );

  const trigger = page.getByRole('button', {name: 'Project actions'});
  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  const sheet = page.getByRole('dialog', {name: 'Project actions'});
  await expect(sheet).toBeVisible();
  await expect(page.getByRole('button', {name: 'Edit project'})).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();

  await trigger.focus();
  await page.keyboard.press('ArrowUp');
  await expect(
    page.getByRole('button', {name: 'Archive project'}),
  ).toBeFocused();
});
