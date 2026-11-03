// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope core/Drawer core/Layer core/Tooltip

/**
 * @file DrawerKeyboardOpen.a11y.chromium.spec.ts
 * @input The built Core/Drawer Scrim story; real Chromium keyboard input
 * @output Browser evidence that opening the scrimless drawer from the keyboard
 *   throws nothing, and that the focused close button's tooltip opens
 * @position Chromium proof for the scrimless Drawer's show running as a layer
 *   popover operation. jsdom has no dialog focusing steps and no refusal of a
 *   nested popover show, so Drawer.test.tsx uses stand-ins for both.
 */

import {expect, test} from '@playwright/test';
import {holdMotionStill} from '@astryxdesign/a11y-spec/chromium';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

// The Chromium that CI installs accepts a show inside another show unless
// these features are on. With them, the base throws and the tooltip stays
// closed.
test.use({
  launchOptions: {
    args: [
      '--enable-blink-features=PopoverHintNewBehavior,PopoverHintNestedShowException',
    ],
  },
});

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

test('opening the scrimless drawer from the keyboard throws nothing and shows the close tooltip', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-drawer--scrim&viewMode=story`,
  );
  await holdMotionStill(page);
  await page.getByRole('button', {name: 'Without scrim'}).focus();
  await page.keyboard.press('Enter');

  const drawer = page.getByRole('dialog', {name: 'Non-modal details'});
  await expect(drawer).toBeVisible();
  // The dialog's show focused its first control, the close button, from a
  // key press, so its tooltip opens once the show has ended.
  await expect(page.getByRole('tooltip')).toBeVisible();
  expect(errors).toEqual([]);
});
