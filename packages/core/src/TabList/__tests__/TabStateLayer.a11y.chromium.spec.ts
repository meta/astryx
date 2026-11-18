// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TabStateLayer.a11y.chromium.spec.ts
 * @input Built TabList stories in real Chromium (desktop, mouse), with the
 *   hover overlay set to an opaque colour
 * @output Browser evidence that a hovered or held Tab's state layer paints
 *   under its label, and a hovered TabMenu trigger's under its chevron: their
 *   pixels stay visible through an opaque overlay
 * @position Real-engine proof for design:user-states (the overlay composes
 *   over the fill without covering content); jsdom does not paint
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
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

// An opaque overlay: a layer above the label hides every glyph pixel.
const OVERLAY = 'rgb(255, 0, 255)';

/**
 * Hovers `control` (and holds a press on it when `held`) and counts the
 * pixels in its label's box (or `part`'s) that are not the overlay colour. A label above the layer keeps its glyphs; one under it
 * leaves a box of overlay colour only.
 */
async function labelPixelsThroughOverlay(
  page: Page,
  control: string,
  {part, held = false}: {part?: string; held?: boolean} = {},
) {
  const overlay = held ? '--color-overlay-pressed' : '--color-overlay-hover';
  await page.addStyleTag({
    content: `#storybook-root * { ${overlay}: ${OVERLAY} !important; transition: none !important; }`,
  });
  const target = page.locator(control).first();
  await target.hover();
  if (held) {
    await page.mouse.down();
  }
  await page.evaluate(
    async () =>
      new Promise<void>(resolve => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }),
  );
  const label =
    part == null
      ? target.getByText(/\S/).first()
      : target.locator(part).first();
  const box = await label.boundingBox();
  if (box == null) {
    throw new Error(`no label box in ${control}`);
  }
  const shot = await page.screenshot({
    clip: box,
    animations: 'disabled',
    type: 'png',
  });
  if (held) {
    await page.mouse.up();
  }
  return page.evaluate(async bytes => {
    const blob = new Blob([new Uint8Array(bytes)], {type: 'image/png'});
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');
    if (context == null) {
      return -1;
    }
    context.drawImage(bitmap, 0, 0);
    const {data} = context.getImageData(0, 0, bitmap.width, bitmap.height);
    let visible = 0;
    for (let i = 0; i < data.length; i += 4) {
      const off =
        Math.abs(data[i] - 255) + data[i + 1] + Math.abs(data[i + 2] - 255);
      if (off > 60) {
        visible += 1;
      }
    }
    return visible;
  }, Array.from(shot));
}

test('a hovered tab keeps its label visible through an opaque hover overlay', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-tablist--default&viewMode=story`,
  );
  const tab = '#storybook-root [data-tab-value]:not([aria-current="true"])';
  await expect(page.locator(tab).first()).toBeVisible();
  const visible = await labelPixelsThroughOverlay(page, tab);
  test.info().annotations.push({type: 'tab', description: `${visible}`});
  expect(visible).toBeGreaterThan(20);
});

test('a held tab keeps its label visible through an opaque press overlay', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-tablist--default&viewMode=story`,
  );
  const tab = '#storybook-root [data-tab-value]:not([aria-current="true"])';
  await expect(page.locator(tab).first()).toBeVisible();
  const visible = await labelPixelsThroughOverlay(page, tab, {held: true});
  test.info().annotations.push({type: 'held tab', description: `${visible}`});
  expect(visible).toBeGreaterThan(20);
});

test('a hovered tab menu trigger keeps its label and chevron visible through an opaque hover overlay', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-tablist--with-menu&viewMode=story`,
  );
  const trigger = '#storybook-root [aria-haspopup="menu"]';
  await expect(page.locator(trigger).first()).toBeVisible();
  const visible = await labelPixelsThroughOverlay(page, trigger);
  const chevron = await labelPixelsThroughOverlay(page, trigger, {
    part: 'svg',
  });
  test.info().annotations.push({
    type: 'trigger',
    description: `label ${visible}, chevron ${chevron}`,
  });
  expect(visible).toBeGreaterThan(20);
  expect(chevron).toBeGreaterThan(10);
});
