// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file home-discover-images.spec.ts
 * @input Production docsite home page, at widths on both sides of the width
 *   from which the Discover section shows its floating images
 * @output Proof that a screen that does not show the images does not request
 *   them, and that a screen that shows them requests each one once
 * @position Docsite browser tests. discover-showcase-images.test.tsx proves
 *   the markup; only a browser selects a source and makes a request.
 */

import {expect, test, type Page} from '@playwright/test';

const IMAGES = [1, 2, 3, 4].map(card => `/landing/discover-card-${card}.webp`);

/** Records each request for a Discover image. */
function watchImages(page: Page) {
  const requests: string[] = [];
  page.on('request', request => {
    const {pathname} = new URL(request.url());
    if (pathname.startsWith('/landing/discover-card-')) {
      requests.push(pathname);
    }
  });
  return requests;
}

/** Brings each part of the page into view once, and waits for its requests. */
async function showWholePage(page: Page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  });
  await page.waitForLoadState('networkidle');
}

for (const width of [390, 959]) {
  test(`at ${width} px, the home page does not request the Discover images, which it does not show`, async ({
    page,
  }) => {
    await page.setViewportSize({width, height: 844});
    const requests = watchImages(page);
    await page.goto('/');
    await showWholePage(page);
    expect(requests).toEqual([]);
    await expect(
      page.locator('img[src^="/landing/discover-card-"]:visible'),
    ).toHaveCount(0);
  });
}

for (const width of [960, 1440]) {
  test(`at ${width} px, the home page shows the four Discover images and requests each one once`, async ({
    page,
  }) => {
    await page.setViewportSize({width, height: 900});
    const requests = watchImages(page);
    await page.goto('/');
    await showWholePage(page);
    expect([...requests].sort()).toEqual(IMAGES);
    const images = page.locator('img[src^="/landing/discover-card-"]');
    await expect(images).toHaveCount(4);
    for (const image of await images.all()) {
      await expect(image).toBeVisible();
      // The image shows its own file, and not the source for a narrow screen.
      expect(
        await image.evaluate((img: HTMLImageElement) => ({
          file: new URL(img.currentSrc).pathname,
          isLoaded: img.complete && img.naturalWidth > 1,
        })),
      ).toEqual({file: await image.getAttribute('src'), isLoaded: true});
    }
  });
}

test('a window that grows to 960 px loads the Discover images then', async ({
  page,
}) => {
  await page.setViewportSize({width: 800, height: 900});
  const requests = watchImages(page);
  await page.goto('/');
  await showWholePage(page);
  expect(requests).toEqual([]);

  await page.setViewportSize({width: 1200, height: 900});
  await expect.poll(() => [...requests].sort()).toEqual(IMAGES);
});
