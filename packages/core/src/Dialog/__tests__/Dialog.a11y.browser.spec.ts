// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file Dialog.a11y.browser.spec.ts
 * @input Built Dialog stories and real Chromium/WebKit pointer and keyboard input
 * @output Browser evidence that Dialog's initial and returning focus follow the
 *   last input (docs/architecture/interaction-modality.md INV1)
 * @position Cross-browser proof; jsdom only proves which focus call Dialog makes.
 *
 * `:focus-visible` is the engine's own answer, so only a shipping engine can
 * show whether a ring is drawn. WebKit is the engine that draws one after a
 * pointer press, both on the focus Dialog moves into the modal and on the
 * focus its native close restores to the invoker.
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

async function mount(page: Page, story: string): Promise<void> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=a11y-dialog-modal-pattern--${story}&viewMode=story`,
  );
}

async function matchesFocusVisible(locator: Locator): Promise<boolean> {
  return locator.evaluate(element => element.matches(':focus-visible'));
}

test('a pointer open draws no ring on the initial focus', async ({page}) => {
  await mount(page, 'pointer-focus-visibility');
  await page.getByRole('button', {name: 'Delete item', exact: true}).click();
  const cancel = page.getByRole('button', {name: 'Cancel', exact: true});
  await expect(cancel).toBeFocused();
  expect(await matchesFocusVisible(cancel)).toBe(false);
});

test('a pointer close draws no ring on the returned focus', async ({page}) => {
  await mount(page, 'pointer-focus-visibility');
  const opener = page.getByRole('button', {name: 'Delete item', exact: true});
  await opener.click();
  await page.getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(page.getByRole('alertdialog')).toBeHidden();
  await expect(opener).toBeFocused();
  expect(await matchesFocusVisible(opener)).toBe(false);
});

test('a keyboard open and Escape close keep both focus rings', async ({
  page,
}) => {
  await mount(page, 'pointer-focus-visibility');
  const opener = page.getByRole('button', {name: 'Delete item', exact: true});
  await opener.focus();
  await page.keyboard.press('Enter');
  const cancel = page.getByRole('button', {name: 'Cancel', exact: true});
  await expect(cancel).toBeFocused();
  expect(await matchesFocusVisible(cancel)).toBe(true);

  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog')).toBeHidden();
  await expect(opener).toBeFocused();
  expect(await matchesFocusVisible(opener)).toBe(true);
});

test('the input that closes owns the returned ring', async ({page}) => {
  await mount(page, 'pointer-focus-visibility');
  const opener = page.getByRole('button', {name: 'Delete item', exact: true});
  await opener.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(page.getByRole('alertdialog')).toBeHidden();
  await expect(opener).toBeFocused();
  expect(await matchesFocusVisible(opener)).toBe(false);
});

test('a pointer-opened form still shows where typing goes', async ({page}) => {
  await mount(page, 'explicit-descendant-focus');
  await page
    .getByRole('button', {name: 'Open contract dialog', exact: true})
    .click();
  const field = page.getByRole('textbox', {name: 'Name', exact: true});
  await expect(field).toBeFocused();
  // The field paints its own focus treatment through `:focus-within` on its
  // wrapper, so hiding the shared ring leaves it in place.
  expect(
    await field.evaluate(element => {
      const wrapper = element.parentElement;
      return (
        wrapper != null &&
        wrapper.matches(':focus-within') &&
        getComputedStyle(wrapper).boxShadow !== 'none'
      );
    }),
  ).toBe(true);
  await page.keyboard.type('Ada');
  await expect(field).toHaveValue('Ada');
});
