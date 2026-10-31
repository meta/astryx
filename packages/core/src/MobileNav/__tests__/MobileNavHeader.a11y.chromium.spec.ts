// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MobileNavHeader.a11y.chromium.spec.ts
 * @input Built MobileNav stories in a phone context in real Chromium
 * @output Browser evidence that the header row is at least one bar high and
 *   grows with taller header content: a stacked title and search field stay
 *   inside the row, and the first navigation item starts below it
 * @position Chromium proof for MobileNav's header row (`styles.header` in
 *   MobileNav.tsx, `minHeight`); jsdom has no layout to measure it
 */

import {expect, test, type Page} from '@playwright/test';
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

test.use({
  hasTouch: true,
  isMobile: true,
  viewport: {width: 390, height: 844},
  deviceScaleFactor: 1,
});

/** Opens a story's drawer and returns the boxes of its header row and first item. */
async function openAndMeasure(page: Page, story: string, firstItem: string) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-mobilenav--${story}&viewMode=story`,
  );
  await page.getByRole('button', {name: 'Open Navigation'}).click();
  const nav = page.getByRole('dialog');
  await expect(nav).toBeVisible();
  const close = nav.getByRole('button', {name: 'Close navigation'});
  // The Close button sits in the header row.
  const header = close.locator('xpath=..');
  const headerBox = await header.boundingBox();
  const itemBox = await nav
    .getByRole('link', {name: firstItem})
    .first()
    .boundingBox();
  if (headerBox == null || itemBox == null) {
    throw new Error('the drawer did not render');
  }
  return {nav, header, headerBox, itemBox};
}

test('a one-line header keeps the one-bar row', async ({page}) => {
  const {headerBox, itemBox} = await openAndMeasure(
    page,
    'default',
    'Dashboard',
  );
  // --spacing-12 at the default root size, as before.
  expect(headerBox.height).toBeCloseTo(48, 0);
  expect(itemBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height);
});

test('a taller header grows its row, and the first item starts below it', async ({
  page,
}) => {
  const {nav, headerBox, itemBox} = await openAndMeasure(
    page,
    'tall-header',
    'Dashboard',
  );
  expect(headerBox.height).toBeGreaterThan(48);
  const search = await nav.getByRole('textbox', {name: 'Search'}).boundingBox();
  if (search == null) {
    throw new Error('the search field did not render');
  }
  // The search field is inside the row, and nothing overlaps the first item.
  expect(search.y).toBeGreaterThanOrEqual(headerBox.y);
  expect(search.y + search.height).toBeLessThanOrEqual(
    headerBox.y + headerBox.height,
  );
  expect(itemBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height);
});
