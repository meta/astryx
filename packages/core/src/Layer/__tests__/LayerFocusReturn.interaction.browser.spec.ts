// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file LayerFocusReturn.interaction.browser.spec.ts
 * @input The built Layer Focus Return stories, real keyboard input and the
 *   interaction harness
 * @output Proofs that a Dialog opened from a menu row returns focus to the
 *   menu's trigger when it closes, after the menu and its row are gone, and
 *   that a Popover whose trigger remounted returns focus to the new trigger
 * @position Browser proofs for utils/focusReturn.ts's return chain
 */

import {expect, test} from '@astryxdesign/a11y-spec/playwright';
import {openStory, withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

test('a dialog opened from a menu row returns focus to the menu trigger', async ({
  page,
}) => {
  await openStory(
    page,
    storybook(),
    'core-layer-focus-return--menu-then-dialog',
  );
  const trigger = page.getByRole('button', {name: 'Actions'});
  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  const row = page.getByRole('menuitem', {name: 'Rename'});
  await expect(row).toBeFocused();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog', {name: 'Rename'});
  await expect(dialog).toBeVisible();
  // The menu and its row are gone; the Dialog holds focus.
  await expect(row).toBeHidden();
  await expect(dialog.getByRole('button', {name: 'Done'})).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('a popover whose trigger remounted returns focus to the new trigger', async ({
  page,
}) => {
  await openStory(
    page,
    storybook(),
    'core-layer-focus-return--remounted-trigger',
  );
  await page.getByRole('button', {name: 'Filter 0'}).focus();
  await page.keyboard.press('Enter');
  const apply = page.getByRole('button', {name: 'Apply'});
  await expect(apply).toBeVisible();
  await apply.focus();
  // Apply replaces the trigger with a new element.
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', {name: 'Filter 1'})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(apply).toBeHidden();
  await expect(page.getByRole('button', {name: 'Filter 1'})).toBeFocused();
});
