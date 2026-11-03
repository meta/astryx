// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y always

/**
 * @file BottomSheetExitFocus.a11y.chromium.spec.ts
 * @input The `Core/BottomSheet` exit-focus fixtures in a built Storybook: Done
 *   closes the sheet, and during the exit the Done control is removed or
 *   disabled.
 * @output Real-engine proof that a closing sheet that held focus goes inert
 *   and aria-hidden as soon as that focus drops to the page, while its exit
 *   still runs.
 * @position Chromium only. jsdom sends no focusout when a focused element is
 *   removed or disabled, so this path is observable only in a browser.
 */

import {expect, test, type Page} from '@playwright/test';
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

async function closeFromDone(page: Page, story: string): Promise<void> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-bottomsheet--${story}&viewMode=story`,
  );
  const opener = page.getByRole('button', {name: 'Open sheet', exact: true});
  await opener.focus();
  await page.keyboard.press('Enter');
  const done = page.getByRole('button', {name: 'Done', exact: true});
  await expect(done).toBeVisible();
  await done.focus();
  await page.keyboard.press('Enter');
}

for (const [story, change] of [
  ['exit-focus-control-removed', 'removed'],
  ['exit-focus-control-disabled', 'disabled'],
] as const) {
  test(`goes inert once its focused control is ${change} during the exit`, async ({
    page,
  }) => {
    await closeFromDone(page, story);
    const dialog = page.locator('dialog[aria-label="Exit focus"]');

    // Held while Done still has focus.
    await expect(dialog).not.toHaveAttribute('inert');
    // After the change at 100 ms, focus is on the page and the dialog is
    // still open for its exit, but inert and hidden.
    await expect
      .poll(async () =>
        dialog.evaluate(
          node =>
            (node as HTMLDialogElement).open &&
            node.hasAttribute('inert') &&
            node.getAttribute('aria-hidden') === 'true' &&
            !node.contains(document.activeElement),
        ),
      )
      .toBe(true);
  });
}
