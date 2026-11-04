// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file header-offset.spec.ts
 * @input Production docsite home page with the canary banner in the header
 * @output Regression proof that --appshell-header-height covers the whole
 *   AppShell header, so the hero and its nav backdrop clear the banner
 * @position Docsite browser tests; jsdom cannot lay out the header
 */

import {expect, test, type Page} from '@playwright/test';

function readHeaderHeightVar(page: Page) {
  return page.evaluate(() =>
    Math.round(
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          '--appshell-header-height',
        ),
      ),
    ),
  );
}

test('the canary banner does not leave the hero and nav backdrop behind it', async ({
  page,
}) => {
  await page.setViewportSize({width: 1440, height: 900});
  await page.goto('/');

  const banner = page.getByRole('region', {name: 'Documentation notice'});
  test.skip((await banner.count()) === 0, 'Only canary builds show the banner');

  const header = page.locator('.astryx-app-shell-header').first();
  const nav = page.getByRole('navigation', {name: 'Astryx navigation'});
  const heightOf = async (locator: typeof header) =>
    Math.round((await locator.boundingBox())?.height ?? Number.NaN);

  const navHeight = await heightOf(nav);
  const headerHeight = await heightOf(header);
  expect(headerHeight).toBeGreaterThan(navHeight);
  await expect.poll(() => readHeaderHeightVar(page)).toBe(headerHeight);

  // The pinned hero band starts below the whole header, not one nav height
  // down, under the banner.
  const heroTop = await page
    .locator('[data-home-page="true"]')
    .first()
    .evaluate(element => Math.round(element.getBoundingClientRect().top));
  expect(heroTop).toBe(headerHeight);

  await banner.getByRole('button', {name: /^Dismiss/}).click();
  await expect(banner).toHaveCount(0);
  await expect.poll(() => heightOf(header)).toBe(navHeight);
  await expect.poll(() => readHeaderHeightVar(page)).toBe(navHeight);
});
