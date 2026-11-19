// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file SliderFramedRelease.interaction.browser.spec.ts
 * @input The built Storybook's Slider story in a sandboxed frame that fills a
 *   desktop window, driven by Playwright's mouse in the full Chromium build
 * @output Proof that a mouse drag released outside the window ends once the
 *   pointer comes back over the frame with no button down
 * @position Browser proof beside SliderFinePointer.interaction.browser.spec.ts.
 *   Chromium's full build misses the release in a sandboxed frame; the
 *   headless shell delivers it. So this file runs in the full build only.
 */

import {expect, test} from '@astryxdesign/a11y-spec/playwright';
import {withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

test.use({
  channel: 'chromium',
  isMobile: false,
  hasTouch: false,
  deviceScaleFactor: 1,
  viewport: {width: 800, height: 600},
});
test.skip(({browserName}) => browserName !== 'chromium', 'Chromium only');

test('a mouse drag on a thumb released outside its frame ends: the thumb does not follow the pointer that comes back with no button down', async ({
  page,
}) => {
  // The page in a sandboxed frame that fills the window, as a viewer shows
  // it. A button let go outside the window sends its pointerup to the top
  // page, not to the frame. The frame's origin is opaque, so the Storybook's
  // module scripts load only with a CORS header.
  await page.route(`${storybook()}/**`, async route => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: {...response.headers(), 'access-control-allow-origin': '*'},
    });
  });
  await page.setContent(
    `<iframe sandbox="allow-scripts" src="${storybook()}/iframe.html?id=core-slider--default&viewMode=story" style="position:absolute;inset:0;width:100%;height:100%;border:0"></iframe>`,
  );
  const frame = page.frameLocator('iframe');
  const thumb = frame.getByRole('slider').first();
  await expect(thumb).toBeVisible();
  const control = thumb.locator(
    'xpath=ancestor::*[contains(@class, "astryx-slider-control")][1]',
  );
  await expect
    .poll(async () =>
      control.evaluate(element =>
        element.getAttribute('data-astryx-touch-action'),
      ),
    )
    .toBe('manipulation');
  const value = async () => Number(await thumb.getAttribute('aria-valuenow'));
  const box = await thumb.boundingBox();
  if (box == null) {
    throw new Error('no thumb box');
  }
  const at = {x: box.x + box.width / 2, y: box.y + box.height / 2};
  const start = await value();
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x + 40, at.y, {steps: 5});
  await expect.poll(value).not.toBe(start);
  // Out of the window, where the button goes up.
  const width = page.viewportSize()?.width ?? 800;
  await page.mouse.move(width + 100, at.y, {steps: 5});
  await page.mouse.up();
  await page.waitForTimeout(100);
  const released = await value();
  // Back over the frame with no button down: the drag is over.
  await page.mouse.move(at.x + 120, at.y, {steps: 5});
  await page.waitForTimeout(100);
  expect(await value()).toBe(released);
});
