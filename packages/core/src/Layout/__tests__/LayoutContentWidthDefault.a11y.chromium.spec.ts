// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/Layout/|apps/storybook/stories/Layout\.stories)

/**
 * @file LayoutContentWidthDefault.a11y.chromium.spec.ts
 * @input The checked-in `core-layout--wider-than-viewport` story in real Chromium
 * @output Evidence that a Layout with no `contentWidth` caps no region
 * @position Real-browser check of `component:Layout`'s default content width:
 *   only a browser resolves container-query units against the right container.
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const STORY_ID = 'core-layout--wider-than-viewport';
const VIEWPORT = {width: 1280, height: 800};

let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});

test.afterAll(async () => {
  await storybook?.close();
});

test.use({viewport: VIEWPORT});

/** The border-box widths of a region and of the inner wrapper it pads. */
async function widths(
  page: Page,
  testId: string,
): Promise<{region: number; inner: number}> {
  return page.getByTestId(testId).evaluate(region => {
    const inner = region.firstElementChild;
    return {
      region: region.getBoundingClientRect().width,
      inner: inner?.getBoundingClientRect().width ?? 0,
    };
  });
}

test.describe('Layout with no contentWidth in a frame wider than the viewport', () => {
  for (const testId of ['wide-header', 'wide-footer']) {
    test(`${testId}: the inner wrapper spans the region, past the viewport`, async ({
      page,
    }) => {
      await page.goto(
        `${storybook.origin}/iframe.html?id=${STORY_ID}&viewMode=story`,
        {waitUntil: 'load'},
      );
      await page.getByTestId(testId).waitFor({state: 'attached'});
      const frame = await page
        .getByTestId('wide-frame')
        .evaluate(element => element.getBoundingClientRect().width);
      expect(frame).toBeGreaterThan(VIEWPORT.width);
      const {region, inner} = await widths(page, testId);
      expect(Math.round(region)).toBe(Math.round(frame));
      expect(Math.round(inner)).toBe(Math.round(region));
    });
  }
});
