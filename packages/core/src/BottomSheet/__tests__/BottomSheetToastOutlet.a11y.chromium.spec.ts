// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file BottomSheetToastOutlet.a11y.chromium.spec.ts
 * @input The built Core/Toast AppToastOverBottomSheet story; real Chromium hit
 *   testing and mouse input
 * @output Browser evidence that a toast fired from an open BottomSheet, on its
 *   own or over a Dialog, is hit-testable above the sheet and takes a click
 * @position Chromium proof for BottomSheet's modal outlet
 *   (Layer/modalOutlet.ts). jsdom has no top layer and no modal inertness, so
 *   Toast/ToastViewport.modalHost.test.tsx can only check where the viewport
 *   lives.
 */

import {expect, test} from '@playwright/test';
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

// Phone width: where an app presents its dialogs as bottom sheets.
test.use({viewport: {width: 390, height: 844}});

const SCENARIOS = [
  {name: 'on its own', opens: ['Open sheet']},
  {name: 'over a Dialog', opens: ['Open dialog', 'Open sheet from the dialog']},
];

for (const {name, opens} of SCENARIOS) {
  test(`a toast action above a sheet opened ${name} takes the click`, async ({
    page,
  }) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=core-toast--app-toast-over-bottom-sheet&viewMode=story`,
    );
    await holdMotionStill(page);
    for (const label of opens) {
      await page.getByRole('button', {name: label, exact: true}).click();
    }
    const sheet = page.getByRole('dialog', {name: 'Item actions'});
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', {name: 'Archive'}).click();
    await expect(sheet.getByText('The item is archived.')).toBeVisible();

    const undo = page.locator('[popover] button', {hasText: 'Undo'});
    await expect(undo).toBeVisible();
    const box = await undo.boundingBox();
    if (box == null) {
      throw new Error('the Undo button has no box');
    }
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    // Hit testing skips inert content and follows top-layer order: a toast
    // left outside the sheet's modal, or under it, loses this point to the
    // sheet.
    const hit = await page.evaluate(
      ([px, py]) =>
        document.elementFromPoint(px, py)?.closest('button')?.textContent ??
        null,
      [x, y],
    );
    expect(hit).toBe('Undo');

    await page.mouse.click(x, y);
    await expect(
      sheet.getByText('The item is back in your inbox.'),
    ).toBeVisible();
  });
}
