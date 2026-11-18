// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file BottomSheetAutofocus.a11y.browser.spec.ts
 * @input The `Core/BottomSheet` "Modal with a data-autofocus field" and "No
 *   scrim with a data-autofocus field" stories, and the stacking "Orders
 *   drill-in" story, in a built Storybook, opened with a real pointer.
 * @output Browser evidence that a sheet that opens, lone or pushed, modal or
 *   not, focuses its `data-autofocus` field, in every engine, wherever the
 *   engine's own dialog focusing steps landed first.
 * @position Cross-browser proof for focusSheetPanel's `open` placement
 *   (bottomSheetStack.ts); jsdom has no native dialog focusing steps, so it
 *   cannot show that the steps' landing on the panel is overridden.
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

async function openSheet(page: Page, story: string): Promise<void> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-bottomsheet--${story}&viewMode=story`,
  );
  await page.getByRole('button', {name: 'Open sheet'}).click();
}

for (const {story, sheet, field} of [
  {story: 'modal-autofocus', sheet: 'Edit note', field: 'Note'},
  {story: 'no-scrim-autofocus', sheet: 'Filter places', field: 'Search'},
]) {
  test(`a lone sheet (${story}) focuses its data-autofocus field on open`, async ({
    page,
  }) => {
    await openSheet(page, story);
    const dialog = page.getByRole('dialog', {name: sheet});
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('textbox', {name: field})).toBeFocused();
  });
}

test('a sheet pushed over another sheet focuses its data-autofocus field on open', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-bottomsheetstacking--orders-drill-in&viewMode=story`,
  );
  await page.getByRole('button', {name: 'Open orders'}).click();
  const orders = page.getByRole('dialog', {name: 'Orders'});
  await orders.getByRole('button', {name: 'View'}).first().click();
  await page.getByRole('button', {name: 'Edit note'}).click();
  const editor = page.getByRole('dialog', {name: 'Edit delivery note'});
  await expect(editor).toBeVisible();
  await expect(
    editor.getByRole('textbox', {name: 'Delivery note'}),
  ).toBeFocused();
});
