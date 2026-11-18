// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file blog-photo-spacing.spec.ts
 * @input Production meetup recap with adjacent body photographs.
 * @output Real-browser proof of separate photo/photo and photo/text gaps.
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

    const textGaps = await photos
      .first()
      .locator('..')
      .evaluate(root => {
        return Array.from(root.children).flatMap(element => {
          const previous = element.previousElementSibling;
          const isParagraph = element.classList.contains(
            'astryx-markdown-paragraph',
          );
          const previousIsParagraph = previous?.classList.contains(
            'astryx-markdown-paragraph',
          );
          const isBoundary =
            (element.tagName === 'IMG' && previousIsParagraph) ||
            (isParagraph && previous?.tagName === 'IMG');
          if (!isBoundary || !previous) {
            return [];
          }
          return [
            element.getBoundingClientRect().top -
              previous.getBoundingClientRect().bottom,
          ];
        });
      });
    expect(textGaps).toHaveLength(8);
    for (const gap of textGaps) {
      expect(gap).toBeGreaterThanOrEqual(31);
      expect(gap).toBeLessThanOrEqual(33);
    }
  });
}

for (const slug of [
  'astryx-v0-6-0',
  'astryx-v0-7-0',
  'internationalizing-astryx',
  'introducing-astryx-richtext',
]) {
  for (const javaScriptEnabled of [false, true]) {
    test(`themed image spacing is stable (${slug}, JavaScript ${javaScriptEnabled})`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        javaScriptEnabled,
        viewport: {width: 1280, height: 900},
      });
      try {
        const page = await context.newPage();
        await page.goto(
          `http://127.0.0.1:${process.env.DOCSITE_E2E_PORT ?? 3233}/blog/${slug}`,
        );
        const body = page
          .locator('[class*="BlogPostBody_body"] .astryx-markdown')
          .first();
        if (javaScriptEnabled) {
          await expect(body.locator('picture')).toHaveCount(0);
        } else {
          expect(await body.locator('picture').count()).toBeGreaterThan(0);
        }
        await body
          .locator('img')
          .evaluateAll(images =>
            Promise.all(
              images.map(image => (image as HTMLImageElement).decode()),
            ),
          );
        const result = await body.evaluate(root => {
          const media = (element: Element | null) =>
            element?.tagName === 'IMG' || element?.tagName === 'PICTURE';
          const gaps = Array.from(root.children).flatMap(element => {
            const previous = element.previousElementSibling;
            const isParagraph = element.classList.contains(
              'astryx-markdown-paragraph',
            );
            const previousIsParagraph = previous?.classList.contains(
              'astryx-markdown-paragraph',
            );
            if (
              !previous ||
              !(
                (media(element) && previousIsParagraph) ||
                (isParagraph && media(previous))
              )
            ) {
              return [];
            }
            return [
              element.getBoundingClientRect().top -
                previous.getBoundingClientRect().bottom,
            ];
          });
          return {
            gaps,
            pictures: Array.from(root.querySelectorAll('picture')).map(
              element => getComputedStyle(element).display,
            ),
          };
        });
        expect(result.gaps.length).toBeGreaterThan(0);
        for (const gap of result.gaps) {
          expect(gap).toBeGreaterThanOrEqual(31);
          expect(gap).toBeLessThanOrEqual(33);
        }
        for (const display of result.pictures) {
          expect(display).toBe('block');
        }
      } finally {
        await context.close();
      }
    });
  }
}
