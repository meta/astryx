// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/Typeahead/|packages/core/src/Tokenizer/|packages/core/src/Popover/|apps/storybook/stories/Typeahead)

/**
 * @file TypeaheadInputPress.a11y.chromium.spec.ts
 * @input The `Core/Typeahead` Default story in a built Storybook, in Chromium.
 * @output Real-browser proof of component:BaseTypeahead FR12: with the list open,
 *   a press in the field's own input keeps it open (native light dismiss used
 *   to close it), and a press elsewhere on the page closes it.
 * @position Runs in pr-a11y when Typeahead, Tokenizer, Popover or this spec
 *   changes. jsdom has no light dismiss, so only a browser shows the defect.
 */

import {expect, test, type Page} from '@playwright/test';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const STORY = 'core-typeahead--default';

let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(DEFAULT_STORYBOOK_DIR);
});

test.afterAll(async () => {
  await storybook?.close();
});

async function openList(page: Page) {
  await page.goto(`${storybook.origin}/iframe.html?id=${STORY}&viewMode=story`);
  const input = page.getByRole('combobox');
  await input.click();
  await input.pressSequentially('ap');
  await expect(input).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('listbox')).toBeVisible();
  return input;
}

test('a press in the input keeps the list open', async ({page}) => {
  const input = await openList(page);
  // Click between the two letters, as a person fixing a typo would.
  const box = await input.boundingBox();
  if (box == null) {
    throw new Error('the input has no layout box');
  }
  await page.mouse.click(box.x + 12, box.y + box.height / 2);
  await expect(input).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('listbox')).toBeVisible();
});

test('a press elsewhere closes the list', async ({page}) => {
  const input = await openList(page);
  await page.mouse.click(5, 5);
  await expect(input).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('listbox')).toBeHidden();
});
