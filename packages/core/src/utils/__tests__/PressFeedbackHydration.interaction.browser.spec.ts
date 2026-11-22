// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PressFeedbackHydration.interaction.browser.spec.ts
 * @input The built PressFeedbackHydration fixture story
 * @output In a real browser, a finger's press on a server-rendered button in a
 *   Suspense boundary that is still loading paints nothing, the boundary then
 *   hydrates with no recoverable error and no hydration mismatch, and a
 *   hydrated button paints its press at once
 * @position Real-browser server render, hydration and post-hydration evidence
 *   for the press controller (utils/pressFeedback.ts) under `spec:AST-013`
 *   FR9; jsdom stands in only for the unit lane
 */

import {expect, test, type Locator} from '@astryxdesign/a11y-spec/playwright';
import {openStory, withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

const FINGER = {pointerType: 'touch', pointerId: 1, isPrimary: true, button: 0};

async function fingerDown(target: Locator): Promise<void> {
  await target.dispatchEvent('pointerdown', {...FINGER, buttons: 1});
}

async function fingerUp(target: Locator): Promise<void> {
  await target.dispatchEvent('pointerup', {...FINGER, buttons: 0});
}

test('a press inside a still-loading boundary paints nothing, and the boundary hydrates without a mismatch', async ({
  page,
}) => {
  await openStory(
    page,
    storybook(),
    'core-pressfeedbackhydration--still-loading-boundary',
  );
  await page.getByRole('button', {name: 'Server render'}).click();
  await expect(page.locator('output[data-phase="server"]')).toHaveCount(1);
  await page.getByRole('button', {name: 'Hydrate'}).click();
  await expect(page.locator('output[data-phase="hydrating"]')).toHaveCount(1);

  const host = page.getByTestId('host');
  const save = host.getByRole('button', {name: 'Save'});
  const menu = host.getByRole('button', {name: 'Menu'});
  // The served Save button is not hydrated yet: a finger's press paints
  // nothing on it.
  await fingerDown(save);
  await expect(save).not.toHaveAttribute('data-astryx-press');

  // Its code arrives during the press, and it hydrates.
  await page.getByRole('button', {name: 'Deliver'}).click();
  await expect(page.locator('output[data-phase="hydrated"]')).toHaveCount(1);
  await fingerUp(save);
  await expect(page.locator('output')).toHaveAttribute('data-errors', '0');

  // A hydrated button paints a finger's press at once.
  await fingerDown(menu);
  await expect(menu).toHaveAttribute('data-astryx-press', 'on');
  await fingerUp(menu);
});
