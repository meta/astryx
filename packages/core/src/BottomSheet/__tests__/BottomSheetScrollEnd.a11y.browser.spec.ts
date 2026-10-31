// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file BottomSheetScrollEnd.a11y.browser.spec.ts
 * @input The `A11y/BottomSheet` direct-content stories in a built Storybook,
 *   in Chromium and WebKit.
 * @output Browser evidence that a sheet whose overflowing content sits
 *   directly in its content box, at the hug height or a budget height, keeps
 *   that box's block-end padding in the scroll range: at the scroll end the
 *   last line, or the last block, clears the end of the range by at least the
 *   padding.
 * @position Guards two WebKit layouts that drop that padding: the open
 *   dialog's panel host (BottomSheet.tsx; a flex column host gave the content
 *   box a definite height) and the content box's own minimum height
 *   (BottomSheetPanel.tsx; WebKit ignores `min-height: min-content` on a
 *   block). WebKit here is desktop WebKit under Playwright, not iOS Safari.
 */

import {expect, test} from '@playwright/test';
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

test.use({viewport: {width: 390, height: 844}, hasTouch: true});

for (const story of [
  'hug-direct-text',
  'hug-direct-blocks',
  'capped-direct-blocks',
]) {
  test(`${story}: the content box's block-end padding stays in the scroll range`, async ({
    page,
  }) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=a11y-bottomsheet--${story}&viewMode=story`,
    );
    await page.getByRole('button', {name: 'Open sheet', exact: true}).click();
    const viewport = page.getByRole('group', {
      name: 'Direct content',
      exact: true,
    });
    await expect(viewport).toHaveAttribute('data-scrollable-block', 'true');
    // The entrance has settled: nothing on the page is still running.
    await expect
      .poll(async () =>
        page.evaluate(
          () =>
            document
              .getAnimations()
              .filter(animation => animation.playState === 'running').length,
        ),
      )
      .toBe(0);
    const {clearance, padding} = await viewport.evaluate(element => {
      element.scrollTop = element.scrollHeight;
      const content = element.querySelector<HTMLElement>(
        '[data-scroll-content]',
      );
      if (content == null) {
        throw new Error('no content box');
      }
      const range = document.createRange();
      range.selectNodeContents(content);
      const last = Math.max(
        ...[...range.getClientRects()].map(rect => rect.bottom),
      );
      // The last content's end, in the scroll range's own coordinates.
      const end =
        last -
        element.getBoundingClientRect().top -
        element.clientTop +
        element.scrollTop;
      return {
        clearance: element.scrollHeight - end,
        padding: Number.parseFloat(getComputedStyle(content).paddingBlockEnd),
      };
    });
    expect(padding).toBeGreaterThan(0);
    expect(clearance).toBeGreaterThanOrEqual(padding - 0.5);
  });
}
