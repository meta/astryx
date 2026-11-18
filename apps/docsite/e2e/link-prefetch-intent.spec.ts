// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file link-prefetch-intent.spec.ts
 * @input The production docsite, the router's prefetch requests, and a real
 *   pointer and keyboard focus
 * @output Proof that a page downloads a linked page only after the visitor
 *   shows intent on its link, and that the link then navigates on the client
 * @position Docsite browser tests; the Vitest suite has no router and sends
 *   no request
 */

import {expect, test, type Locator, type Page} from '@playwright/test';

const SOURCE = '/docs/getting-started';

/** The paths of the pages that the router downloads ahead of a navigation. */
function watchPrefetches(page: Page): string[] {
  const paths: string[] = [];
  page.on('request', request => {
    const headers = request.headers();
    if (
      headers['next-router-prefetch'] != null ||
      headers['next-router-segment-prefetch'] != null
    ) {
      paths.push(new URL(request.url()).pathname);
    }
  });
  return paths;
}

/** The full page loads that start after this call. */
function watchPageLoads(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', request => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      urls.push(request.url());
    }
  });
  return urls;
}

function sidebarLink(page: Page, name: string): Locator {
  return page.getByRole('link', {name, exact: true}).first();
}

/**
 * Rests the pointer on `link` until the router downloads `path`. The link
 * ignores the pointer until its script runs, so the first tries can fail.
 */
async function restPointerOn(
  page: Page,
  link: Locator,
  prefetches: string[],
  path: string,
) {
  await expect(async () => {
    await page.mouse.move(0, 0);
    await link.hover();
    await expect.poll(() => prefetches, {timeout: 2_000}).toContain(path);
  }).toPass();
}

test('a page downloads no linked page until the visitor shows intent', async ({
  page,
}) => {
  const prefetches = watchPrefetches(page);
  await page.goto(SOURCE);
  await page.waitForLoadState('networkidle');
  // The first screen shows links to more than 20 other pages.
  await expect(sidebarLink(page, 'Theming')).toBeInViewport();
  await expect(sidebarLink(page, 'Layout')).toBeInViewport();

  // A link that shows intent proves that the links are live. Before that
  // moment, no link has asked for its page.
  await restPointerOn(
    page,
    sidebarLink(page, 'Theming'),
    prefetches,
    '/docs/theme',
  );
  expect(new Set(prefetches)).toEqual(new Set(['/docs/theme']));
});

test('a link with a resting pointer downloads its page, and the click navigates on the client', async ({
  page,
}) => {
  const prefetches = watchPrefetches(page);
  await page.goto(SOURCE);
  const link = sidebarLink(page, 'Theming');
  await restPointerOn(page, link, prefetches, '/docs/theme');

  const pageLoads = watchPageLoads(page);
  await link.click();
  await expect(page).toHaveURL(/\/docs\/theme$/);
  await expect(
    page.getByRole('heading', {level: 1, name: 'Theming'}),
  ).toBeVisible();
  expect(pageLoads).toEqual([]);
});

test('a link with a resting keyboard focus downloads its page', async ({
  page,
}) => {
  const prefetches = watchPrefetches(page);
  await page.goto(SOURCE);
  const link = sidebarLink(page, 'Layout');
  await expect(async () => {
    await link.blur();
    await link.focus();
    await expect
      .poll(() => prefetches, {timeout: 2_000})
      .toContain('/docs/layout');
  }).toPass();
  expect(new Set(prefetches)).toEqual(new Set(['/docs/layout']));
});

test('a visitor who asks to save data downloads a page only at the click', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: {saveData: true},
    });
  });
  const prefetches = watchPrefetches(page);
  await page.goto(SOURCE);
  await page.waitForLoadState('networkidle');

  // The click navigates on the client, which proves that the links are live.
  const pageLoads = watchPageLoads(page);
  await sidebarLink(page, 'Theming').click();
  await expect(
    page.getByRole('heading', {level: 1, name: 'Theming'}),
  ).toBeVisible();
  expect(pageLoads).toEqual([]);

  const link = sidebarLink(page, 'Layout');
  await link.hover();
  await link.focus();
  await page.waitForTimeout(500);
  expect(prefetches).toEqual([]);
});
