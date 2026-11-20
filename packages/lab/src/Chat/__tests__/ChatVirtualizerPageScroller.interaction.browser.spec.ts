// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChatVirtualizerPageScroller.interaction.browser.spec.ts
 * @input The built "Page Scroller" ChatVirtualizer story: attach mode on
 *   `document.scrollingElement`, 10,000 messages of varied height, a header
 *   above the list, anchored to the first message
 * @output Proof that the page stays at the first message and shows rows,
 *   frame after frame, and that a scroll down then back keeps rows on screen
 * @position Interaction proof for ChatVirtualizer.tsx's attach mode on the
 *   page's own scroller, run by `pnpm test:interaction`
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  frames,
  openStory,
  withStorybook,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

const STORY = 'lab-chatvirtualizer--page-scroller';

/** The page's scroll position and the rows painted inside the viewport. */
async function readPage(page: Page) {
  return page.evaluate(() => {
    const height = window.innerHeight;
    const rows = Array.from(
      document.querySelectorAll<HTMLElement>('[data-pkey]'),
    ).filter(row => {
      const rect = row.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < height && rect.height > 0;
    });
    return {
      scrollY: window.scrollY,
      visibleKeys: rows.map(row => row.dataset.pkey),
    };
  });
}

test('anchored to the first message, the page stays at the top and shows rows', async ({
  page,
}) => {
  await openStory(page, storybook(), STORY);
  await expect(page.locator('[data-pkey="0"]')).toBeVisible();
  // Every pass re-reads the list's origin: a wrong origin compounds frame
  // after frame, so the check holds over many frames, not one.
  for (let check = 0; check < 10; check++) {
    await frames(page, 6);
    const {scrollY, visibleKeys} = await readPage(page);
    expect(scrollY, `scrollY on check ${check}`).toBeLessThan(400);
    expect(visibleKeys, `rows in view on check ${check}`).toContain('0');
  }
});

test('a scroll down the page and back keeps rows on screen', async ({page}) => {
  await openStory(page, storybook(), STORY);
  await expect(page.locator('[data-pkey="0"]')).toBeVisible();
  for (const y of [3_000, 12_000, 0]) {
    await page.evaluate(top => window.scrollTo(0, top), y);
    await frames(page, 8);
    const {scrollY, visibleKeys} = await readPage(page);
    expect(
      Math.abs(scrollY - y),
      `scrollY after scrolling to ${y}`,
    ).toBeLessThan(400);
    expect(visibleKeys.length, `rows in view at ${y}`).toBeGreaterThan(0);
  }
});
