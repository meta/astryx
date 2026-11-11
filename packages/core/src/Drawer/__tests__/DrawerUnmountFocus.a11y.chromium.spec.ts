// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope core/Drawer ^apps/storybook/stories/Drawer

/**
 * @file DrawerUnmountFocus.a11y.chromium.spec.ts
 * @input The built Core/Drawer UnmountWhileOpen story; real Chromium focus,
 *   mouse and keyboard input
 * @output Browser evidence that a non-modal Drawer removed while open returns
 *   focus to the button that opened it (Drawer FR8)
 * @position Chromium proof for useDrawerDialogPresence's removal path. In a
 *   browser, removing the focused drawer drops focus to the page body; jsdom
 *   only approximates that.
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
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

async function openStory(page: Page) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-drawer--unmount-while-open&viewMode=story`,
  );
  await holdMotionStill(page);
}

test('a click on Save inside the drawer returns focus to Edit row', async ({
  page,
}) => {
  await openStory(page);
  const edit = page.getByRole('button', {name: 'Edit row', exact: true});
  await edit.click();
  const drawer = page.getByRole('dialog', {name: 'Edit row'});
  await expect(drawer).toBeVisible();
  const save = drawer.getByRole('button', {name: 'Save'});
  await save.click();
  await expect(drawer).toHaveCount(0);
  await expect(edit).toBeFocused();
});

test('Enter on Save returns focus to Edit row', async ({page}) => {
  await openStory(page);
  const edit = page.getByRole('button', {name: 'Edit row', exact: true});
  await edit.focus();
  await page.keyboard.press('Enter');
  const drawer = page.getByRole('dialog', {name: 'Edit row'});
  await expect(drawer).toBeVisible();
  await drawer.getByRole('button', {name: 'Save'}).focus();
  await page.keyboard.press('Enter');
  await expect(drawer).toHaveCount(0);
  await expect(edit).toBeFocused();
});
