// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DateInputFocusLeave.interaction.browser.spec.ts
 * @input Storybook story core-dateinput--formats (four DateInput fields)
 * @output component:DateInput FR8 in a real browser: with one calendar open
 *   from its input, a press in the same input keeps it open; Tab to the next
 *   field or a press in another field's text closes it, and focus stays where
 *   the person moved it (the close never pulls focus back).
 * @position DateInput press and focus-leave evidence, run in the Chromium
 *   interaction lane; jsdom has neither light dismiss nor real focus order.
 */

import {expect, test, type Page} from '@playwright/test';
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

async function openFirst(page: Page) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-dateinput--formats&viewMode=story`,
  );
  const fields = page.getByRole('combobox');
  await fields.first().waitFor();
  await fields.first().click();
  await expect(fields.first()).toHaveAttribute('aria-expanded', 'true');
  return fields;
}

test('a press in the same input keeps the calendar open', async ({page}) => {
  const fields = await openFirst(page);
  await fields.first().click();
  await expect(fields.first()).toHaveAttribute('aria-expanded', 'true');
});

test('a press in another field closes the calendar and keeps focus there', async ({
  page,
}) => {
  const fields = await openFirst(page);
  await fields.nth(1).click();
  await expect(fields.first()).toHaveAttribute('aria-expanded', 'false');
  await expect(fields.nth(1)).toBeFocused();
});

test('focus moved to another field closes the calendar and stays there', async ({
  page,
}) => {
  const fields = await openFirst(page);
  await fields.nth(2).focus();
  await expect(fields.first()).toHaveAttribute('aria-expanded', 'false');
  await expect(fields.nth(2)).toBeFocused();
});
