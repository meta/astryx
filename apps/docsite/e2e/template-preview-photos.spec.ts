// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file template-preview-photos.spec.ts
 * @input Production docsite home page and community page, whose templates
 *   card shows page templates as scaled-down tiles
 * @output Proof that PREVIEW_IMAGE_WIDTH in
 *   scripts/generate-landing-template-previews.mjs is enough for the size
 *   that a tile draws its photos at
 * @position Docsite browser tests; only a laid-out page shows how large a
 *   tile draws a photo
 */

import {expect, test} from '@playwright/test';

/** Image pixels for each CSS pixel: enough for a 2x screen. */
const SHARP = 2;

const CASES = [
  {path: '/', width: 390, min: SHARP},
  // The home page's tiles are largest at this width: one pixel more, and
  // the card shows smaller tiles. Only the largest photo is below SHARP.
  {path: '/', width: 527, min: 1.5},
  {path: '/', width: 1440, min: SHARP},
  // The community page's tiles are near their largest at this width.
  {path: '/community', width: 480, min: SHARP},
  {path: '/community', width: 1440, min: SHARP},
];

for (const {path, width, min} of CASES) {
  test(`at ${width} px, each photo of a template preview tile on ${path} has ${min} image pixels or more for each CSS pixel`, async ({
    page,
  }) => {
    await page.setViewportSize({width, height: 900});
    await page.goto(path);
    const tiles = page.locator('iframe[src*="/landing/template-previews/"]');
    await tiles.first().scrollIntoViewIfNeeded();

    const photos: {name: string; density: number}[] = [];
    for (const tile of await tiles.all()) {
      const box = await tile.boundingBox();
      if (box == null) {
        continue;
      }
      // The tile's element has the layout width of its page, and the box has
      // the width that the tile draws.
      const scale =
        box.width /
        (await tile.evaluate(
          (iframe: HTMLIFrameElement) => iframe.offsetWidth,
        ));
      const images = tile.contentFrame().locator('img[src*="/_next/image"]');
      for (const image of await images.all()) {
        await expect
          .poll(() =>
            image.evaluate((img: HTMLImageElement) =>
              img.complete ? img.naturalWidth : 0,
            ),
          )
          .toBeGreaterThan(0);
        photos.push(
          await image.evaluate((img: HTMLImageElement, tileScale) => {
            const drawn = img.getBoundingClientRect();
            // A photo covers its box, so the axis with fewer image pixels
            // for each CSS pixel sets how sharp it is.
            return {
              name: new URL(img.currentSrc).searchParams.get('url') ?? '',
              density: Math.min(
                img.naturalWidth / (drawn.width * tileScale),
                img.naturalHeight / (drawn.height * tileScale),
              ),
            };
          }, scale),
        );
      }
    }

    expect(photos.length).toBeGreaterThan(0);
    expect(photos.filter(photo => photo.density < min)).toEqual([]);
  });
}
