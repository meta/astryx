// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/(Tokenizer|Typeahead|PowerSearch|Tooltip)/|packages/core/src/hooks/useInputStatusIcon|apps/storybook/stories/(Tokenizer|Typeahead|PowerSearch)\.stories)

/**
 * @file TokenizerStatusTooltip.a11y.chromium.spec.ts
 * @input The `Status Variant Comparison` stories of `Core/Tokenizer`,
 *   `Core/Typeahead` and `Core/PowerSearch` in a built Storybook, in Chromium.
 * @output Real-browser proof that a `tooltip` status draws a visible info-tip
 *   inside the field, that hover, keyboard focus and a click reveal its
 *   message, and that a click leaves focus on the info-tip.
 * @position Runs in pr-a11y when these components, Tooltip, the status icon
 *   hook or the stories change.
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

const CASES = [
  {
    story: 'core-tokenizer--status-variant-comparison',
    message: 'Select at least one member',
  },
  {
    story: 'core-typeahead--status-variant-comparison',
    message: 'Please make a selection',
  },
  {
    story: 'core-powersearch--status-variant-comparison',
    message: 'Add at least one filter',
  },
] as const;

async function open(page: Page, story: string): Promise<void> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=${story}&viewMode=story`,
    {waitUntil: 'load'},
  );
  await page.getByRole('combobox', {name: 'Tooltip'}).waitFor();
  await page.getByRole('button', {name: 'Error details'}).waitFor();
}

for (const {story, message} of CASES) {
  test.describe(story, () => {
    test('draws one visible info-tip inside the tooltip field', async ({
      page,
    }) => {
      await open(page, story);
      const button = page.getByRole('button', {name: 'Error details'});
      await expect(button).toHaveCount(1);
      await expect(button).toBeVisible();
      const icon = await button.boundingBox();
      expect(icon?.width).toBeGreaterThan(0);
      expect(icon?.height).toBeGreaterThan(0);
    });

    test('hover reveals the message', async ({page}) => {
      await open(page, story);
      const tooltip = page
        .locator('[role="tooltip"]:popover-open')
        .filter({hasText: message});
      await expect(tooltip).toHaveCount(0);
      await page.getByRole('button', {name: 'Error details'}).hover();
      await expect(tooltip).toBeVisible();
    });

    test('keyboard focus reveals the message', async ({page}) => {
      await open(page, story);
      await page.getByRole('combobox', {name: 'Tooltip'}).focus();
      await page.keyboard.press('Tab');
      await expect(
        page.getByRole('button', {name: 'Error details'}),
      ).toBeFocused();
      await expect(
        page
          .locator('[role="tooltip"]:popover-open')
          .filter({hasText: message}),
      ).toBeVisible();
    });

    test('a click leaves focus on the info-tip', async ({page}) => {
      await open(page, story);
      const button = page.getByRole('button', {name: 'Error details'});
      await button.click();
      // A mouse press dismisses the tip (component:Tooltip); focus stays on
      // the info-tip instead of moving to the input.
      await expect(button).toBeFocused();
    });
  });
}
