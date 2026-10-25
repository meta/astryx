// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file BottomSheetFocusReturn.a11y.browser.spec.ts
 * @input The `Core/DropdownMenu` action-sheet story with a trigger the caller
 *   renders, in a built Storybook, and real Chromium/WebKit pointer and
 *   keyboard input.
 * @output Browser evidence that the focus a BottomSheet returns when it closes
 *   follows the last input (docs/architecture/interaction-modality.md INV1):
 *   no ring after a pointer close, the ring after a keyboard close.
 * @position Cross-browser proof; jsdom only proves which focus call the sheet
 *   makes. The menu's sheet returns focus through BottomSheet's
 *   `finalFocusRef`, and a control the caller renders carries no style of its
 *   own that would hide a ring, so the ring shown is the browser's answer.
 *   Chromium rings it when a keyboard-opened sheet is closed by a pointer;
 *   WebKit also rings it after a tap open and a tap close.
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
    `${storybook.origin}/iframe.html?id=core-dropdownmenu--action-sheet-custom-trigger&viewMode=story`,
  );
  const trigger = page.getByRole('button', {
    name: 'Project actions',
    exact: true,
  });
  await expect(trigger).toBeVisible();
  return trigger;
}

async function openFromKeyboard(page: Page, trigger: Locator): Promise<void> {
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
}

function row(page: Page): Locator {
  return page.getByRole('dialog').getByRole('button', {name: /Edit project/});
}

async function expectReturnedFocus(
  page: Page,
  trigger: Locator,
  ring: boolean,
): Promise<void> {
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(
    await trigger.evaluate(element => element.matches(':focus-visible')),
  ).toBe(ring);
}

test('a keyboard-opened sheet closed by a pointer pick returns focus without a ring', async ({
  page,
}) => {
  const trigger = await mount(page);
  await openFromKeyboard(page, trigger);
  await row(page).click();
  await expectReturnedFocus(page, trigger, false);
});

test('a pointer open and pointer pick return focus without a ring', async ({
  page,
}) => {
  const trigger = await mount(page);
  await trigger.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await row(page).click();
  await expectReturnedFocus(page, trigger, false);
});

test('a keyboard-opened sheet closed by Escape keeps the ring', async ({
  page,
}) => {
  const trigger = await mount(page);
  await openFromKeyboard(page, trigger);
  await page.keyboard.press('Escape');
  await expectReturnedFocus(page, trigger, true);
});
