// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DateInputSecondFieldFocus.interaction.browser.spec.ts
 * @input Storybook story core-dateinput--formats (four DateInput fields)
 * @output In a real browser, with one calendar opened from its calendar
 *   button and focus on a day in its grid: a press in another field's text
 *   closes the calendar, and that field keeps focus and takes the typed text.
 *   Escape from the grid still returns focus to the calendar button.
 * @position DateInput focus-leave evidence for a calendar that holds focus,
 *   run in the Chromium interaction lane
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {openStory, withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

test.use({
  isMobile: false,
  hasTouch: false,
  viewport: {width: 1024, height: 768},
});

// Opens the first field's calendar from its button with the keyboard, then
// moves focus onto a day in the grid.
async function focusFirstGridDay(page: Page) {
  await openStory(page, storybook(), 'core-dateinput--formats');
  const fields = page.getByRole('combobox');
  await fields.first().waitFor();
  const opener = page.getByRole('button', {name: /open calendar/i}).first();
  await opener.focus();
  await page.keyboard.press('Enter');
  await expect(fields.first()).toHaveAttribute('aria-expanded', 'true');
  const day = page.getByRole('grid').getByRole('button').first();
  await day.focus();
  await expect(day).toBeFocused();
  return {fields, opener};
}

test('a press in another field from a focused grid day keeps focus in that field', async ({
  page,
}) => {
  const {fields} = await focusFirstGridDay(page);
  const second = fields.nth(1);
  await second.click();
  await expect(fields.first()).toHaveAttribute('aria-expanded', 'false');
  await expect(second).toBeFocused();
  await page.keyboard.type('1');
  await expect(second).toHaveValue(/1/);
});

test('Escape from a focused grid day returns focus to the calendar button', async ({
  page,
}) => {
  const {fields, opener} = await focusFirstGridDay(page);
  await page.keyboard.press('Escape');
  await expect(fields.first()).toHaveAttribute('aria-expanded', 'false');
  await expect(opener).toBeFocused();
});
