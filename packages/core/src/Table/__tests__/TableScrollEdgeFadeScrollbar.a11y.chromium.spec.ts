// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file TableScrollEdgeFadeScrollbar.a11y.chromium.spec.ts
 * @input Built responsive Table story in real Chromium, a fine pointer, and
 *   classic scrollbars
 * @output Browser evidence that the edge fade never paints over a classic
 *   scrollbar
 * @position Table integration proof for the shared scroll-edge presenter
 */

import {expect, test, type Locator} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

// Headless Chromium hides scrollbars by default; this file shows them.
test.use({launchOptions: {ignoreDefaultArgs: ['--hide-scrollbars']}});

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

async function arrowPixel(viewport: Locator): Promise<number> {
  const box = await viewport.boundingBox();
  if (box == null) {
    throw new Error('Table scroll viewport has no rendered bounds');
  }
  const bar = await viewport.evaluate(
    (element: HTMLElement) => element.offsetHeight - element.clientHeight,
  );
  // The end arrow button sits at the inline end of the scrollbar.
  const shot = await viewport.page().screenshot({
    clip: {
      x: box.x + box.width - bar,
      y: box.y + box.height - bar,
      width: bar,
      height: bar,
    },
  });
  return viewport.page().evaluate(async png => {
    const image = new Image();
    image.src = `data:image/png;base64,${png}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (context == null) {
      throw new Error('No 2D canvas context');
    }
    context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, image.width, image.height).data;
    // The darkest pixel is the arrow glyph.
    let darkest = 255;
    for (let i = 0; i < data.length; i += 4) {
      darkest = Math.min(darkest, data[i]);
    }
    return darkest;
  }, shot.toString('base64'));
}

test('a fine pointer with a classic scrollbar shows the scrollbar unfaded', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-table--responsive-scroll&viewMode=story`,
  );
  const viewport = page.locator('.astryx-table-scroll-wrapper').first();
  await expect(viewport).toHaveAttribute('data-scrollable-inline', 'true');
  const bar = await viewport.evaluate(
    (element: HTMLElement) => element.offsetHeight - element.clientHeight,
  );
  test.skip(bar < 4, 'this platform overlays its scrollbar');
  // In the middle both edges hide content, so a fade would cover both arrows.
  await viewport.evaluate((element: HTMLElement) => {
    element.scrollLeft = (element.scrollWidth - element.clientWidth) / 2;
  });
  await expect(viewport).not.toHaveAttribute('data-scroll-inline-end', 'true');
  expect(
    await viewport.evaluate(element => getComputedStyle(element).maskImage),
  ).toBe('none');

  // The arrow reads the same as with every mask removed.
  const shown = await arrowPixel(viewport);
  await viewport.evaluate((element: HTMLElement) => {
    element.style.setProperty('mask-image', 'none', 'important');
  });
  expect(await arrowPixel(viewport)).toBe(shown);
});
