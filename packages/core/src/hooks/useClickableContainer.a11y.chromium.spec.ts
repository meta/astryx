// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/(hooks/(useClickableContainer|usePressFeedback)|utils/interactionOverlay|VisuallyHidden)|apps/storybook/stories/PressableSurfaceRecipe\.stories)

/**
 * @file useClickableContainer.a11y.chromium.spec.ts
 * @input The built "pressable surface without Card chrome" stories in real
 *   Chromium
 * @output Evidence that the recipe's surface exposes one named button (or
 *   link), that Tab reaches it, that the surface shows the focus ring from
 *   the focus tokens while it has keyboard focus, and that a press on the
 *   words acts while a press on a nested link does not
 * @position Real-engine check for the documented useClickableContainer recipe
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const BUTTON_STORY = 'core-hooks-useclickablecontainer--pressable-surface';
const LINK_STORY = 'core-hooks-useclickablecontainer--pressable-surface-link';

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

async function openStory(page: Page, story: string): Promise<void> {
  await page.goto(`${storybook.origin}/iframe.html?id=${story}&viewMode=story`);
  await page.getByText('Replying to Alex').waitFor();
}

/** The computed outline of the element that holds `text`'s surface. */
async function surfaceOutline(page: Page) {
  return page.getByText('Replying to Alex').evaluate(node => {
    const surface = node.closest('[data-astryx-pressable]');
    if (surface == null) {
      return null;
    }
    const style = getComputedStyle(surface);
    return {style: style.outlineStyle, width: parseFloat(style.outlineWidth)};
  });
}

test('the surface exposes one named button that Tab reaches, with the focus ring', async ({
  page,
}) => {
  await openStory(page, BUTTON_STORY);
  const control = page.getByRole('button', {
    name: 'Jump to the quoted message',
  });
  await expect(control).toHaveCount(1);

  const before = await surfaceOutline(page);
  expect(before?.width ?? 0).toBe(0);

  await page.keyboard.press('Tab');
  await expect(control).toBeFocused();
  const focused = await surfaceOutline(page);
  expect(focused?.style).toBe('solid');
  expect(focused?.width ?? 0).toBeGreaterThan(0);

  await page.keyboard.press('Enter');
  await expect(page.getByText('Jumped 1×')).toBeVisible();
});

test('a press on the words acts; a press on a nested link does not', async ({
  page,
}) => {
  await openStory(page, BUTTON_STORY);
  await page.getByText('Can we move the review').click();
  await expect(page.getByText('Jumped 1×')).toBeVisible();

  await page.getByRole('link', {name: 'agenda'}).click();
  await expect(page.getByText('Jumped 1×')).toBeVisible();
});

test('a destination surface exposes one named link that Tab reaches', async ({
  page,
}) => {
  await openStory(page, LINK_STORY);
  const control = page.getByRole('link', {name: 'Open the quoted message'});
  await expect(control).toHaveCount(1);
  await page.keyboard.press('Tab');
  await expect(control).toBeFocused();
  const focused = await surfaceOutline(page);
  expect(focused?.width ?? 0).toBeGreaterThan(0);
});
