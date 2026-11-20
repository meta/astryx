// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file link-prefetch-intent.spec.ts
 * @input The production docsite, the router's prefetch requests, and a real
 *   pointer, keyboard focus and touch
 * @output Proof that a page downloads a linked page only after the visitor
 *   shows intent on its link, that a touch downloads nothing ahead, and that
 *   the link then navigates on the client
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
  // A key press tells the browser that the visitor uses the keyboard.
  await page.keyboard.press('Shift');
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

test.describe('on a touch screen', () => {
  test.use({
    viewport: {width: 390, height: 844},
    hasTouch: true,
    isMobile: true,
  });

  test('a swipe that starts on a link and a tap download no page ahead', async ({
    page,
  }) => {
    const prefetches = watchPrefetches(page);
    await page.goto('/blog');
    await page.waitForLoadState('networkidle');
    const post = page
      .locator('#astryx-app-shell-main a[href^="/blog/"]')
      .first();
    await expect(post).toBeInViewport();
    const box = await post.boundingBox();
    const href = await post.getAttribute('href');
    if (box == null || href == null) {
      throw new Error('The first post link has no box or no destination.');
    }

    // A swipe: the finger lands on the link and moves up.
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const touch = await page.context().newCDPSession(page);
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{x, y}],
    });
    for (let step = 1; step <= 10; step++) {
      await page.waitForTimeout(16);
      await touch.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{x, y: y - step * 30}],
      });
    }
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(100);
    await page.waitForTimeout(500);
    expect(prefetches).toEqual([]);

    // The tap navigates on the client, which proves that the links are live.
    const pageLoads = watchPageLoads(page);
    await post.tap();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(page.getByRole('heading', {level: 1}).first()).toBeVisible();
    expect(pageLoads).toEqual([]);
    expect(prefetches).toEqual([]);
  });
});
