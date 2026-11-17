// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file TableScrollEdgeFadeScrollbar.a11y.chromium.spec.ts
 * @input Built responsive Table story in real Chromium
 * @output Browser evidence that the shared edge fade leaves a classic
 *   scrollbar painted
 * @position Table integration proof for the shared scroll-edge presenter
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
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

async function overflowingTable(page: Page): Promise<Locator> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-table--responsive-scroll&viewMode=story`,
  );
  const viewport = page.locator('.astryx-table-scroll-wrapper').first();
  await expect(viewport).toHaveAttribute('data-scrollable-inline', 'true');
  return viewport;
}

async function maskOf(viewport: Locator): Promise<string> {
  return viewport.evaluate(element => getComputedStyle(element).maskImage);
}

async function scrollTo(viewport: Locator, edge: 'start' | 'middle' | 'end') {
  await viewport.evaluate((element, where) => {
    const max = element.scrollWidth - element.clientWidth;
    const rtl = getComputedStyle(element).direction === 'rtl';
    const offset = where === 'start' ? 0 : where === 'end' ? max : max / 2;
    element.scrollLeft = rtl ? -offset : offset;
  }, edge);
}

test('a classic scrollbar keeps its paint at a faded edge', async ({page}) => {
  const viewport = await overflowingTable(page);
  // A black page shows through any masked paint, so a faded track darkens.
  await page.addStyleTag({content: 'html, body { background: black; }'});
  const bar = await viewport.evaluate(
    element => element.offsetHeight - element.clientHeight,
  );
  test.skip(bar < 4, 'this platform overlays its scrollbar');
  // At the end, the start edge fades and the thumb sits at the far end.
  await scrollTo(viewport, 'end');
  await expect.poll(async () => maskOf(viewport)).toContain('linear-gradient');
  const box = await viewport.boundingBox();
  if (box == null) {
    throw new Error('Table scroll viewport has no rendered bounds');
  }
  // Two track pixels inside the faded band, past the arrow button: a mask
  // would paint them apart.
  const shot = await page.screenshot({
    clip: {
      x: box.x,
      y: box.y + box.height - bar,
      width: box.width,
      height: bar,
    },
  });
  const pixels = await page.evaluate(async png => {
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
    const y = Math.floor(image.height / 2);
    const at = (x: number) => context.getImageData(x, y, 1, 1).data[0];
    return {edge: at(18), inner: at(30)};
  }, shot.toString('base64'));
  expect(Math.abs(pixels.edge - pixels.inner)).toBeLessThanOrEqual(3);
});
