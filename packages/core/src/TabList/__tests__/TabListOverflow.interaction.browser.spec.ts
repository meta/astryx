// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TabListOverflow.interaction.browser.spec.ts
 * @input The built Overflow and WithMenu TabList stories, in a real browser,
 *   on a page whose reset lets flex items shrink below their content
 *   (`* { min-width: 0 }`)
 * @output Proof that every stop in an overflowing strip, each hugging tab
 *   and a TabMenu trigger, keeps at least its content's width while the
 *   strip scrolls
 * @position Layout evidence for Tab's and TabMenu's hug sizing in
 *   /packages/core/src/TabList
 */

import {expect, test, type Page} from '@playwright/test';
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

/** Opens a built story and waits for its tab strip. */
async function openStory(page: Page, id: string): Promise<void> {
  const params = new URLSearchParams({id, viewMode: 'story'});
  await page.goto(`${storybook.origin}/iframe.html?${params}`);
  await page.locator('.astryx-tab-strip').first().waitFor();
}

/** A common page reset that lets flex items shrink below their content. */
async function allowShrinkBelowContent(page: Page): Promise<void> {
  await page.addStyleTag({content: '* { min-width: 0; }'});
}

/** Each stop's rendered width against its content's, and the strip's overflow. */
async function measureStrip(page: Page) {
  return page.evaluate(() => {
    const strip = document.querySelector('.astryx-tab-strip');
    if (strip == null) {
      throw new Error('no tab strip');
    }
    let scroller: Element | null = strip;
    while (
      scroller != null &&
      scroller.scrollWidth <= scroller.clientWidth + 1
    ) {
      scroller = scroller.parentElement;
    }
    const stops = [
      ...strip.querySelectorAll<HTMLElement>(
        'button:not(.astryx-tab-scroll-button)',
      ),
    ].map(stop => ({
      label: stop.textContent?.trim() ?? '',
      width: stop.getBoundingClientRect().width,
      content: stop.scrollWidth,
    }));
    return {stops, scrolls: scroller != null};
  });
}

test('in a narrow strip every hugging tab keeps its label width and the strip scrolls', async ({
  page,
}) => {
  await page.setViewportSize({width: 362, height: 700});
  await openStory(page, 'core-tablist--overflow');
  await allowShrinkBelowContent(page);
  const {stops, scrolls} = await measureStrip(page);
  expect(stops.length).toBeGreaterThan(4);
  for (const stop of stops) {
    expect(stop.width, stop.label).toBeGreaterThanOrEqual(stop.content - 1);
  }
  expect(scrolls).toBe(true);
});

test('in a narrow strip with a TabMenu, the menu trigger keeps its width too', async ({
  page,
}) => {
  await page.setViewportSize({width: 170, height: 700});
  await openStory(page, 'core-tablist--with-menu');
  await allowShrinkBelowContent(page);
  const {stops} = await measureStrip(page);
  const trigger = stops.find(stop => stop.label.startsWith('More'));
  expect(trigger).toBeDefined();
  for (const stop of stops) {
    expect(stop.width, stop.label).toBeGreaterThanOrEqual(stop.content - 1);
  }
});
