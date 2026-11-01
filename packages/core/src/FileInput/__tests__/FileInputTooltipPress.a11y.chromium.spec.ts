// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file FileInputTooltipPress.a11y.chromium.spec.ts
 * @input The `Core/FileInput` AuditMatrix story in a built Storybook, in
 *   Chromium: the compact and dropzone fields with a tooltip status.
 * @output Real-browser proof of component:Tooltip FR11 in FileInput: a click on
 *   the open status tooltip's text never raises the file chooser, while a
 *   click on the empty dropzone still does.
 * @position Runs in pr-a11y when FileInput, Tooltip or this spec changes.
 */

import {expect, test, type Page} from '@playwright/test';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const STORY = 'core-fileinput--audit-matrix';
const MESSAGE = 'File must be under 10MB';

let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(DEFAULT_STORYBOOK_DIR);
});

test.afterAll(async () => {
  await storybook?.close();
});

async function openStory(page: Page): Promise<void> {
  await page.goto(`${storybook.origin}/iframe.html?id=${STORY}&viewMode=story`);
  await page.locator('[data-audit-case="dropzone-empty"]').waitFor();
}

/** Resolves true when a file chooser opens within `timeout` ms. */
async function chooserWithin(page: Page, timeout: number): Promise<boolean> {
  return page
    .waitForEvent('filechooser', {timeout})
    .then(() => true)
    .catch(() => false);
}

test('a click on the empty dropzone raises the file chooser', async ({
  page,
}) => {
  await openStory(page);
  const chooser = chooserWithin(page, 3000);
  await page
    .locator('[data-audit-case="dropzone-empty"] .astryx-file-input')
    .click();
  expect(await chooser).toBe(true);
});

for (const id of ['input-error-tooltip', 'dropzone-error-tooltip']) {
  test(`a click on the open status tooltip's text raises no chooser (${id})`, async ({
    page,
  }) => {
    await openStory(page);
    const field = page.locator(`[data-audit-case="${id}"]`);
    // Keyboard focus opens the status tooltip: Tab from the trigger lands on
    // the status button (the FileInput audit's focus order).
    await field.locator('button[type="button"][aria-label]').first().focus();
    await page.keyboard.press('Tab');
    await expect(
      field.getByRole('button', {name: 'Error details'}),
    ).toBeFocused();
    const tooltip = page
      .locator('[role="tooltip"]:popover-open')
      .filter({hasText: MESSAGE});
    await expect(tooltip).toBeVisible();
    const chooser = chooserWithin(page, 1000);
    await tooltip.getByText(MESSAGE).click();
    expect(await chooser).toBe(false);
  });
}
