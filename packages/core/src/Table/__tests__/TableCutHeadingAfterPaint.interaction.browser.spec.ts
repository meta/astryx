// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TableCutHeadingAfterPaint.interaction.browser.spec.ts
 * @input The built Table Heading Overflow story in a real browser
 * @output Proof that a truncating table starts to load the module for its cut
 *   headings only after the frame that first paints the table
 * @position Interaction evidence for
 *   packages/core/src/Text/cutTextOnKeyboardFocus.tsx under a Table, whose
 *   commit runs the header cells' effects before the browser paints
 */

import {expect, test} from '@astryxdesign/a11y-spec/playwright';
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

test.use({
  viewport: {width: 900, height: 700},
  isMobile: false,
  hasTouch: false,
});

const story = () =>
  `${storybook.origin}/iframe.html?id=core-table--heading-overflow&viewMode=story`;

test('a truncating table loads its cut-heading module after the frame that first paints it', async ({
  page,
}) => {
  // The frame after the table enters the page is the frame that paints it:
  // the browser paints after that frame's animation callbacks.
  await page.addInitScript(() => {
    new MutationObserver((_, observer) => {
      const heading = document.querySelector(
        '[data-heading-overflow="truncate"] th',
      );
      if (heading == null) {
        return;
      }
      observer.disconnect();
      requestAnimationFrame(() => {
        (window as unknown as {__paintFrame: number}).__paintFrame =
          performance.now();
      });
    }).observe(document, {childList: true, subtree: true});
  });
  await page.goto(story());
  const timing = await (
    await page.waitForFunction(() => {
      const paintFrame = (window as unknown as {__paintFrame?: number})
        .__paintFrame;
      const request = performance
        .getEntriesByType('resource')
        .find(entry => /\/cutText[^/]*\.js(\?.*)?$/.test(entry.name));
      return paintFrame == null || request == null
        ? null
        : {paintFrame, fetchStart: request.startTime};
    })
  ).jsonValue();
  if (timing == null) {
    throw new Error('no paint frame or module request');
  }
  const {paintFrame, fetchStart} = timing;
  expect(
    fetchStart,
    `the module's request starts at ${fetchStart} ms; the frame that paints the table starts at ${paintFrame} ms`,
  ).toBeGreaterThan(paintFrame);
});
