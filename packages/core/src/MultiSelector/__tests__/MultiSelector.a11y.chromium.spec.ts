// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file MultiSelector.a11y.chromium.spec.ts
 * @input Uses the checked-in no-search bottom-sheet Storybook fixture and Chromium
 * @output Chromium accessibility-tree regression coverage for the sheet listbox name
 * @position Browser-only accessibility regression test for MultiSelector
 */

import {expect, test} from '@playwright/test';
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

test('names the no-search bottom-sheet listbox from the MultiSelector label', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-multiselector--bottom-sheet-presentation&viewMode=story`,
    {waitUntil: 'load'},
  );

  await page.getByRole('combobox', {name: 'Teams'}).click();

  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible();
  // Playwright resolves this matcher from Chromium's accessibility tree, not
  // the DOM attribute alone. Keep this as the regression proof for the modal
  // layer's formerly unnamed listbox.
  await expect(listbox).toHaveAccessibleName('Teams');
});
