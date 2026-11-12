// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^packages/core/src/Tokenizer/ ^apps/storybook/stories/Tokenizer

/**
 * @file TokenizerSelectedForcedColors.a11y.chromium.spec.ts
 * @input The built Tokenizer "Pre-selected Items" story in real Chromium on a
 *   tablet-sized touch screen, with forced colors emulated
 * @output Browser evidence, read from the screen's pixels: in forced colors
 *   the token the first Delete selects paints the system Highlight. Its name
 *   sits on that fill and stands out from it. The selection then stays
 *   visible where forced colors drop the theme's accent fill
 * @position Regression proof for the selected token's forced-colors paint
 *   (Chromium only: Playwright's WebKit matches the forced-colors query but
 *   forces nothing)
 */

// @ts-expect-error -- pngjs ships no declarations; runtime support is pinned.
import {PNG} from 'pngjs';
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

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

type Rgb = [number, number, number];

function luminance([r, g, b]: Rgb): number {
  const linear = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

/**
 * What the screen shows inside an element's box, 1 CSS px in from its edge.
 * Its surface is its most common pixel. Its ink is the contrast of the pixel
 * that differs most from that surface.
 */
async function paintOf(element: Locator): Promise<{surface: Rgb; ink: number}> {
  const box = await element.boundingBox();
  if (box == null) {
    throw new Error('The element is not on screen');
  }
  const shot = await element.page().screenshot({
    animations: 'disabled',
    clip: {
      x: box.x + 1,
      y: box.y + 1,
      width: box.width - 2,
      height: box.height - 2,
    },
  });
  const png = PNG.sync.read(shot);
  const counts = new Map<number, number>();
  const pixels: Rgb[] = [];
  for (let i = 0; i < png.data.length; i += 4) {
    const pixel: Rgb = [png.data[i], png.data[i + 1], png.data[i + 2]];
    pixels.push(pixel);
    const key = (pixel[0] << 16) | (pixel[1] << 8) | pixel[2];
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const [key] = [...counts].reduce((best, entry) =>
    entry[1] > best[1] ? entry : best,
  );
  const surface: Rgb = [(key >> 16) & 255, (key >> 8) & 255, key & 255];
  return {
    surface,
    ink: Math.max(...pixels.map(pixel => contrast(pixel, surface))),
  };
}

/** The system Highlight as the screen shows it, from a probe painted with it. */
async function highlightOnScreen(page: Page): Promise<Rgb> {
  await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.id = 'highlight-probe';
    probe.style.cssText =
      'position:fixed;top:0;left:0;width:40px;height:40px;' +
      'forced-color-adjust:none;background-color:Highlight';
    document.body.append(probe);
  });
  const probe = page.locator('#highlight-probe');
  const {surface} = await paintOf(probe);
  await probe.evaluate(element => element.remove());
  return surface;
}

// The inline field on a touch screen is a tablet's: a phone's default field
// is the bottom sheet, which has no input.
test.use({
  viewport: {width: 1024, height: 1366},
  hasTouch: true,
  isMobile: true,
});

test('in forced colors the selected token shows Highlight, and its name sits on it, readable', async ({
  page,
}) => {
  await page.emulateMedia({forcedColors: 'active'});
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-tokenizer--with-preselected&viewMode=story`,
  );
  await page.getByRole('combobox').first().tap();
  await page.keyboard.press('Backspace');
  const selected = page.locator('.astryx-token[aria-description]');
  await expect(selected).toHaveCount(1);
  const highlight = await highlightOnScreen(page);
  const other = await paintOf(
    page.locator('.astryx-token:not([aria-description])').first(),
  );
  expect((await paintOf(selected)).surface).toEqual(highlight);
  expect(other.surface).not.toEqual(highlight);
  // The name sits on the Highlight fill, not on the browser's own backplate.
  // It stands out from that fill as text must (WCAG AA, 4.5:1).
  const name = await paintOf(
    selected.locator('span').filter({hasText: /\S/}).first(),
  );
  expect(name.surface).toEqual(highlight);
  expect(name.ink).toBeGreaterThanOrEqual(4.5);
});
