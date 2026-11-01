// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CollapsibleCloseFocus.a11y.chromium.spec.ts
 * @input The built Storybook's `Core/Collapsible` "Close Focus" story: a
 *   Collapsible its app closes from a `[` shortcut, with a button inside its
 *   content and one outside it
 * @output Real-Chromium proof of `component:Collapsible` AR4: focus inside the
 *   content when it closes moves to the trigger; focus elsewhere is not moved
 * @position Testing; the unit cases are in Collapsible.test.tsx and
 *   motion/animatedLayoutAdopters.test.tsx
 *
 * SYNC: When modified, update the AR4 Verification row in Collapsible.spec.md.
 */

import {expect, test, type Page} from '@playwright/test';
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

async function openStory(page: Page): Promise<void> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-collapsible--close-focus&viewMode=story`,
  );
  await page.getByRole('button', {name: 'Inside'}).waitFor();
}

test('focus inside the content moves to the trigger when it closes', async ({
  page,
}) => {
  await openStory(page);
  await page.getByRole('button', {name: 'Inside'}).focus();
  await page.keyboard.press('[');

  const trigger = page.getByRole('button', {name: 'Details'});
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();
});

test('focus outside the content is not moved', async ({page}) => {
  await openStory(page);
  const elsewhere = page.getByRole('button', {name: 'Elsewhere'});
  await elsewhere.focus();
  await page.keyboard.press('[');

  await expect(page.getByRole('button', {name: 'Details'})).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(elsewhere).toBeFocused();
});
