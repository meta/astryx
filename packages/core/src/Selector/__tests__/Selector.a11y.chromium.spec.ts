// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file Selector.a11y.chromium.spec.ts
 * @input Uses the checked-in no-search bottom-sheet Storybook story and Chromium
 * @output Chromium accessibility-tree regression coverage for the sheet listbox name
 * @position Browser-only accessibility regression test for Selector
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

test('names the no-search bottom-sheet listbox from the Selector label', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-selector--bottom-sheet-presentation&viewMode=story`,
    {waitUntil: 'load'},
  );

  await page.getByRole('combobox', {name: 'Team'}).click();

  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible();
  // Playwright resolves this matcher from Chromium's accessibility tree, not
  // the DOM attribute alone. The sheet is a modal layer, so a reference to the
  // trigger outside it produces no name; this is the regression proof.
  await expect(listbox).toHaveAccessibleName('Team');
});
