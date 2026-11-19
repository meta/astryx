// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^packages/core/src/SideNav/SideNavHeading ^apps/storybook/stories/NavMenu

/**
 * @file NavHeadingMenuStory.a11y.chromium.spec.ts
 * @input The built Storybook's `Core/NavMenu` "With icons" story: a
 *   NavHeadingMenu opened from a SideNavHeading
 * @output Real-Chromium proof of the keyboard path into the heading menu:
 *   Tab reaches the heading, Enter opens the menu with focus on an item, the
 *   arrow keys move focus between items, and Escape returns focus to the
 *   heading
 * @position Testing; the unit cases are in NavHeadingMenu.test.tsx
 */

import {expect, test} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(DEFAULT_STORYBOOK_DIR);
});

test.afterAll(async () => {
  await storybook?.close();
});

test('a keyboard user opens the heading menu, moves through its items, and leaves it', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-navmenu--with-icons&viewMode=story`,
  );
  const heading = page.getByRole('button', {name: /Workspace/});
  await heading.waitFor();

  await page.keyboard.press('Tab');
  await expect(heading).toBeFocused();

  await page.keyboard.press('Enter');
  const focused = page.locator(':focus');
  await expect(focused).toHaveAttribute('role', 'menuitem');
  const firstLabel = (await focused.textContent())?.trim();

  await page.keyboard.press('ArrowDown');
  await expect(focused).toHaveAttribute('role', 'menuitem');
  await expect(focused).not.toHaveText(firstLabel ?? '');

  await page.keyboard.press('Escape');
  await expect(heading).toBeFocused();
  await expect(page.getByRole('menuitem')).toHaveCount(0);
});
