// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DateInputFocusLeave.interaction.browser.spec.ts
 * @input Storybook DateInput formats and calendar focus handoff stories
 * @output Outside presses and focus moves preserve the destination field.
 *   Escape and clicks on empty space restore the calendar opener.
 * @position DateInput press and focus-leave evidence, run in the Chromium
 *   interaction lane; jsdom has neither light dismiss nor real focus order.
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
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

async function openCalendarFromKeyboard(page: Page) {
  await openStory(page, storybook(), 'core-dateinput--calendar-focus-handoff');
  const first = page.getByRole('combobox', {name: 'First date'});
  const second = page.getByRole('combobox', {name: 'Second date'});
  const opener = page.getByRole('button', {name: 'Open calendar'}).first();
  await opener.focus();
  await page.keyboard.press('Enter');
  await expect(first).toHaveAttribute('aria-expanded', 'true');
  const grid = page.getByRole('grid');
  await expect(grid).toBeVisible();
  await grid.getByRole('button', {name: /15 December 2026/}).focus();
  await page.keyboard.press('ArrowRight');
  await expect(
    grid.getByRole('button', {name: /16 December 2026/}),
  ).toBeFocused();
  return {first, second, opener};
}

test('an outside click from the calendar grid lets the next field receive typed dates', async ({
  page,
}) => {
  const {first, second} = await openCalendarFromKeyboard(page);
  await second.click();
  await expect(first).toHaveAttribute('aria-expanded', 'false');
  await expect(second).toBeFocused();
  await page.keyboard.type('16/12/2026');
  await expect(second).toHaveValue('16/12/2026');
});

test('Escape from the calendar grid restores the opener', async ({page}) => {
  const {first, opener} = await openCalendarFromKeyboard(page);
  await page.keyboard.press('Escape');
  await expect(first).toHaveAttribute('aria-expanded', 'false');
  await expect(opener).toBeFocused();
});

test('an outside click on empty space restores the calendar opener', async ({
  page,
}) => {
  const {first, opener} = await openCalendarFromKeyboard(page);
  await page.mouse.click(16, 16);
  await expect(first).toHaveAttribute('aria-expanded', 'false');
  await expect(opener).toBeFocused();
});
