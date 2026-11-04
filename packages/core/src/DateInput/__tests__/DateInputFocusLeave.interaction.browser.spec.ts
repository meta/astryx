// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DateInputFocusLeave.interaction.browser.spec.ts
 * @input Storybook story core-dateinput--formats (four DateInput fields)
 * @output In a real browser, with one calendar open from its input: a press
 *   in the same input keeps it open; a press in another field's text or focus
 *   moved to another field closes it, and focus stays where it moved (the
 *   close never pulls focus back).
 * @position DateInput press and focus-leave evidence, run in the Chromium
 *   interaction lane; jsdom has neither light dismiss nor real focus order.
 */

import {expect, test, type Page} from '@playwright/test';
import {openStory, withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

// A fine pointer on a desktop-sized page, where the calendar is the anchored
// popover this record covers (a coarse pointer presents a bottom sheet).
test.use({
  isMobile: false,
  hasTouch: false,
  viewport: {width: 1024, height: 768},
});

async function openFirst(page: Page) {
  await openStory(page, storybook(), 'core-dateinput--formats');
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
