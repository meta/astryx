// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file blog-photo-spacing.spec.ts
 * @input Production meetup recap with adjacent body photographs.
 * @output Real-browser proof that adjacent photos have a token-sized gap.
 * @position Docsite integration regression; media dimensions stay unchanged.
 */

import {expect, test} from '@playwright/test';

for (const width of [390, 1280]) {
  test(`adjacent blog photos stay separated at ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height: 900});
    await page.goto('/blog/astryx-meetup-are-design-systems-still-valuable');
    const photos = page.locator(
      '.astryx-markdown img[src*="astryx-meetup-are-design-systems-still-valuable/photo-"]',
    );
    await expect(photos).toHaveCount(7);
    await photos.evaluateAll(images =>
      Promise.all(images.map(image => (image as HTMLImageElement).decode())),
    );
    const gaps = await photos.evaluateAll(images =>
      images.flatMap(image => {
        const previous = image.previousElementSibling;
        if (previous?.tagName !== 'IMG') {
          return [];
        }
        return [
          image.getBoundingClientRect().top -
            previous.getBoundingClientRect().bottom,
        ];
      }),
    );
    expect(gaps).toHaveLength(3);
    for (const gap of gaps) {
      expect(gap).toBeGreaterThanOrEqual(16);
      expect(gap).toBeLessThanOrEqual(32);
    }
  });
}
