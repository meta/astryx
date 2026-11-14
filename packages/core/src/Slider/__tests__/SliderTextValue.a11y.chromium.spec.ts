// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SliderTextValue.a11y.chromium.spec.ts
 * @input The CustomStep story (0 to 100 by 10, `valueDisplay="text"`) in
 *   Chromium
 * @output Tests that the track keeps one length while the text value
 *   changes, at the narrowest and the widest value (`component:Slider` FR8)
 * @position Real-browser half of FR8; Slider.test.tsx checks the reservation
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

/** The width of the track: the row part the text value follows. */
async function trackWidth(page: Page): Promise<number> {
  return page.getByRole('slider').evaluate(thumb => {
    let node: Element | null = thumb;
    while (node != null && node.nextElementSibling?.tagName !== 'SPAN') {
      node = node.parentElement;
    }
    if (node == null) {
      throw new Error('no text value after the track');
    }
    return node.getBoundingClientRect().width;
  });
}

test('the track keeps one length from the narrowest to the widest text value', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-slider--custom-step&viewMode=story`,
  );
  const thumb = page.getByRole('slider');
  await thumb.focus();
  await page.keyboard.press('Home');
  await expect(thumb).toHaveAttribute('aria-valuenow', '0');
  const narrow = await trackWidth(page);
  await page.keyboard.press('End');
  await expect(thumb).toHaveAttribute('aria-valuenow', '100');
  const wide = await trackWidth(page);
  expect(Math.abs(wide - narrow)).toBeLessThanOrEqual(0.5);
});
