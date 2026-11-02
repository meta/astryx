// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/CommandPalette/|apps/storybook/stories/CommandPalette)

/**
 * @file CommandPalettePending.a11y.chromium.spec.ts
 * @input The `Core/CommandPalette` Built-in strings story in a built Storybook,
 *   in Chromium: bootstrap returns nothing, and search answers after 600 ms.
 * @output Real-browser proof of component:CommandPalette FR1's pending case:
 *   while the first query is pending, the result surface shows no message
 *   ("Type to search" never sits under a typed query) and keeps the Empty
 *   container's height, so the result surface does not jump.
 * @position Runs in pr-a11y when CommandPalette, its stories or this spec
 *   changes.
 */

import {expect, test} from '@playwright/test';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const STORY = 'core-commandpalette--built-in-strings';

let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(DEFAULT_STORYBOOK_DIR);
});

test.afterAll(async () => {
  await storybook?.close();
});

test('the first pending query shows no message and keeps the height', async ({
  page,
}) => {
  await page.goto(`${storybook.origin}/iframe.html?id=${STORY}&viewMode=story`);
  await page.locator('#storybook-root button').first().click();
  const dialog = page.locator('dialog[open]');
  await expect(dialog.getByText('Type to search')).toBeVisible();
  // The result surface's layout height (offsetHeight ignores the dialog's
  // entry transform, which a bounding box would include mid-animation).
  const empty = dialog.locator('.astryx-command-palette-empty');
  const before = await empty.evaluate(
    (element: HTMLElement) => element.offsetHeight,
  );

  await dialog.getByRole('combobox').pressSequentially('butt');
  // The search answers after 600 ms; check while the spinner shows.
  await expect(dialog.locator('.astryx-spinner')).toBeVisible();
  await expect(dialog.getByText('Type to search')).toHaveCount(0);
  await expect(dialog.getByText('No results')).toHaveCount(0);
  const pending = await empty.evaluate(
    (element: HTMLElement) => element.offsetHeight,
  );
  expect(pending).toBe(before);

  await expect(dialog.getByText('No results')).toBeVisible();
});
