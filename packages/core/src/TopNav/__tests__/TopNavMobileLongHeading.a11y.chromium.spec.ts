// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y always

/**
 * @file TopNavMobileLongHeading.a11y.chromium.spec.ts
 * @input The `Core/AppShell` Long Heading On Mobile story in a built Storybook
 *   at a 320px phone viewport.
 * @output Real-engine proof that a long TopNav heading gives way on a narrow
 *   screen: the menu toggle stays inside the compact bar, and the drawer's
 *   close button stays inside the drawer.
 * @position Run with `pnpm test:a11y-contract`. jsdom has no layout, so where
 *   the toggle lands is only observable here.
 */

import {expect, test, type Locator} from '@playwright/test';
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

const STORY = 'core-appshell--long-heading-on-mobile';

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (box == null) {
    throw new Error('the element has no layout box');
  }
  return box;
}

test('a long heading keeps the menu toggle and the drawer close button on screen', async ({
  page,
}) => {
  await page.setViewportSize({width: 320, height: 568});
  await page.goto(`${storybook.origin}/iframe.html?id=${STORY}&viewMode=story`);

  const bar = page.getByRole('navigation', {name: 'Main navigation'});
  const toggle = page.getByRole('button', {name: 'Open navigation'});
  await expect(toggle).toBeVisible();

  const barBox = await boxOf(bar);
  const toggleBox = await boxOf(toggle);
  expect(toggleBox.x).toBeGreaterThanOrEqual(barBox.x);
  expect(toggleBox.x + toggleBox.width).toBeLessThanOrEqual(
    barBox.x + barBox.width,
  );

  await toggle.click();

  const drawer = page.getByRole('dialog', {name: 'Navigation'});
  const close = drawer.getByRole('button', {name: 'Close navigation'});
  await expect(close).toBeVisible();

  // The drawer slides in from the inline end; measure once it has settled.
  await expect(close).toBeInViewport({ratio: 1});
  const drawerBox = await boxOf(drawer);
  const closeBox = await boxOf(close);
  expect(closeBox.x).toBeGreaterThanOrEqual(drawerBox.x);
  expect(closeBox.x + closeBox.width).toBeLessThanOrEqual(
    drawerBox.x + drawerBox.width,
  );
});
