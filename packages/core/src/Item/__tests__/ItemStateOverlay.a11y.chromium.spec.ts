// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope core/Item core/List ^apps/storybook/stories/Item

/**
 * @file ItemStateOverlay.a11y.chromium.spec.ts
 * @input The built Core/Item "States" story; real Chromium mouse input
 * @output Browser evidence that a highlighted or selected row still paints
 *   the hover and a mouse press's `:active` overlay over its own fill, as a
 *   row at rest does, and that its fill returns once the pointer leaves
 * @position Chromium proof for component:Item FR9 and design:user-states (the
 *   pressed overlay composes over a persistent state fill). jsdom resolves no
 *   cascade, so only a browser shows which paint wins.
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {holdMotionStill} from '@astryxdesign/a11y-spec/chromium';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';
// @ts-expect-error -- pngjs ships no declarations; runtime support is pinned.
import {PNG} from 'pngjs';

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

test.use({viewport: {width: 640, height: 480}});

type Rgb = [number, number, number];

// The colour at one point of the page, from a 1 × 1 screenshot.
async function colourAt(page: Page, x: number, y: number): Promise<Rgb> {
  const bytes = await page.screenshot({clip: {x, y, width: 1, height: 1}});
  const png = PNG.sync.read(bytes);
  return [png.data[0], png.data[1], png.data[2]];
}

const differs = (a: Rgb, b: Rgb) => a.some((channel, i) => channel !== b[i]);

for (const mode of ['light', 'dark'] as const) {
  // Rest is the control: a row with no state fill, which has always painted
  // both. A highlighted row's fill is already the hover tone, so it shows
  // only its press.
  for (const label of ['Rest', 'Highlighted', 'Selected']) {
    const showsHover = label !== 'Highlighted';
    test(`a ${label.toLowerCase()} row paints ${showsHover ? 'hover and press' : 'press, not hover,'} over its fill (${mode})`, async ({
      page,
    }) => {
      await page.goto(
        `${storybook.origin}/iframe.html?id=core-item--states&viewMode=story&globals=colorMode:${mode};astryxTheme:neutral`,
      );
      await holdMotionStill(page);
      const row = page
        .locator('#storybook-root .astryx-item')
        .filter({hasText: label})
        .first();
      const box = await row.boundingBox();
      if (box == null) {
        throw new Error(`no ${label} row`);
      }
      // A point in the row clear of its text, icon and badge.
      const x = Math.round(box.x + box.width * 0.6);
      const y = Math.round(box.y + 4);
      await page.mouse.move(1, 470);
      const rest = await colourAt(page, x, y);
      await page.mouse.move(x, y);
      if (showsHover) {
        await expect
          .poll(async () => differs(await colourAt(page, x, y), rest))
          .toBe(true);
      } else {
        // Give a hover transition time to show before reading no change.
        await page.waitForTimeout(400);
        expect(differs(await colourAt(page, x, y), rest)).toBe(false);
      }
      const hover = await colourAt(page, x, y);
      await page.mouse.down();
      await expect
        .poll(async () => differs(await colourAt(page, x, y), hover))
        .toBe(true);
      await page.mouse.up();
      await page.mouse.move(1, 470);
      await expect
        .poll(async () => differs(await colourAt(page, x, y), rest))
        .toBe(false);
    });
  }
}

test.describe('under a finger', () => {
  // A phone: coarse primary pointer. The press paints on the row's compositor
  // layer, above the state fill.
  test.use({hasTouch: true, isMobile: true});

  for (const mode of ['light', 'dark'] as const) {
    for (const label of ['Rest', 'Highlighted', 'Selected']) {
      test(`a finger press paints a ${label.toLowerCase()} row (${mode})`, async ({
        page,
        context,
      }) => {
        await page.goto(
          `${storybook.origin}/iframe.html?id=core-item--states&viewMode=story&globals=colorMode:${mode};astryxTheme:neutral`,
        );
        await holdMotionStill(page);
        const row = page
          .locator('#storybook-root .astryx-item')
          .filter({hasText: label})
          .first();
        const box = await row.boundingBox();
        if (box == null) {
          throw new Error(`no ${label} row`);
        }
        const x = Math.round(box.x + box.width * 0.6);
        const y = Math.round(box.y + 4);
        const rest = await colourAt(page, x, y);
        const cdp = await context.newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{x, y, id: 1}],
        });
        await expect
          .poll(async () => differs(await colourAt(page, x, y), rest))
          .toBe(true);
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchEnd',
          touchPoints: [],
        });
      });
    }
  }
});
