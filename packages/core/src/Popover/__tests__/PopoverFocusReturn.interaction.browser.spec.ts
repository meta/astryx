// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PopoverFocusReturn.interaction.browser.spec.ts
 * @input The built Confirmation Popover story (a controlled popover with
 *   auto focus), real keyboard input and the interaction harness
 * @output Proofs that a controlled popover opened from the keyboard returns
 *   focus to its trigger when it closes, by Escape and by a pick
 * @position Browser proofs for Popover/usePopover.tsx's focus return
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {openStory, withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

/** Opens the Confirmation story's popover from its focused trigger. */
async function openFromKeyboard(page: Page) {
  const trigger = page.getByRole('button', {name: 'Delete project'});
  await trigger.focus();
  await page.keyboard.press('Enter');
  // Initial focus moves inside the open popover.
  await expect(
    page.getByRole('button', {name: 'Delete', exact: true}),
  ).toBeFocused();
  return trigger;
}

test('a controlled popover opened from the keyboard returns focus to its trigger on Escape', async ({
  page,
}) => {
  await openStory(page, storybook(), 'core-popover--confirmation');
  const trigger = await openFromKeyboard(page);
  await page.keyboard.press('Escape');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();
});

test('a controlled popover opened from the keyboard returns focus to its trigger after a pick', async ({
  page,
}) => {
  await openStory(page, storybook(), 'core-popover--confirmation');
  const trigger = await openFromKeyboard(page);
  // The focused Delete button closes the popover.
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();
});
