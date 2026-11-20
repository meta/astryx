// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DropdownMenuPendingOpen.a11y.browser.spec.ts
 * @input The `Core/DropdownMenu` InClosedInFlowDialog story in a built
 *   Storybook
 * @output Proof that a menu in a closed `<dialog>` that the page displays,
 *   whose layer opens one commit after the press, still takes focus and fires
 *   `onClick` once
 * @position Browser accessibility spec beside DropdownMenu's unit tests;
 *   `DropdownMenuPendingOpen.test.tsx` covers an open that waits for a
 *   settling ancestor
 *
 * SYNC: The story is in apps/storybook/stories/DropdownMenu.stories.tsx.
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

const STORY = 'core-dropdownmenu--in-closed-in-flow-dialog';

async function openStory(page: Page): Promise<void> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=${STORY}&viewMode=story`,
    {waitUntil: 'load'},
  );
}

test('a click opens the menu with focus on it, and fires onClick once', async ({
  page,
}) => {
  await openStory(page);
  await page.getByRole('button', {name: 'Actions'}).click();
  const menu = page.getByRole('menu', {name: 'Actions', exact: true});
  await expect(menu).toBeVisible();
  // A pointer open focuses the menu itself, so no row looks picked.
  await expect(menu).toBeFocused();
  await expect(page.getByTestId('clicks')).toHaveText('1');
});

test('Enter on the trigger opens the menu on its first row, and ArrowUp on its last', async ({
  page,
}) => {
  await openStory(page);
  const trigger = page.getByRole('button', {name: 'Actions'});
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitem', {name: 'Rename'})).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('menuitem', {name: 'Delete'})).toBeFocused();
});
