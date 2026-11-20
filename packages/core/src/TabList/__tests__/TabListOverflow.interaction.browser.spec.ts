// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TabListOverflow.interaction.browser.spec.ts
 * @input The built Overflow and WithMenu TabList stories, in a real browser,
 *   on a page whose reset lets flex items shrink below their content
 *   (`* { min-width: 0 }`)
 * @output Proof that every stop in an overflowing strip, each hugging tab
 *   and a TabMenu trigger, keeps at least its content's width while the
 *   strip scrolls, and that the forward arrow key moves focus onto an
 *   overflowed tab and scrolls it into view, left to right and right to left
 * @position Layout evidence for Tab's and TabMenu's hug sizing in
 *   /packages/core/src/TabList
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

for (const direction of ['ltr', 'rtl'] as const) {
  test(`the forward arrow from the last visible tab focuses and reveals the next one (${direction})`, async ({
    page,
  }) => {
    await page.setViewportSize({width: 390, height: 700});
    const params = new URLSearchParams({
      id: 'core-tablist--overflow',
      viewMode: 'story',
      globals: `direction:${direction}`,
    });
    await page.goto(`${storybook.origin}/iframe.html?${params}`);
    await page.locator('.astryx-tab-strip').first().waitFor();
    const forward = direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
    const stripDirection = await page.evaluate(() => {
      const strip = document.querySelector('.astryx-tab-strip');
      return strip == null ? '' : getComputedStyle(strip).direction;
    });
    expect(stripDirection).toBe(direction);

    /** Each tab's label and whether the strip's scroller shows all of it. */
    const tabsInView = async () =>
      page.evaluate(() => {
        const tabs = [
          ...document.querySelectorAll<HTMLElement>(
            '.astryx-tab-strip [role="tab"], .astryx-tab-strip button',
          ),
        ];
        let scroller: HTMLElement | null =
          document.querySelector<HTMLElement>('.astryx-tab-strip');
        while (
          scroller != null &&
          scroller.scrollWidth <= scroller.clientWidth + 1
        ) {
          scroller = scroller.parentElement;
        }
        const view = (scroller ?? document.body).getBoundingClientRect();
        return tabs.map(tab => {
          const r = tab.getBoundingClientRect();
          return {
            label: tab.innerText.trim(),
            visible: r.left >= view.left - 1 && r.right <= view.right + 1,
            focused: tab === document.activeElement,
          };
        });
      });

    const before = await tabsInView();
    const lastVisible = before.map(tab => tab.visible).lastIndexOf(true);
    expect(lastVisible).toBeLessThan(before.length - 1);
    // Enter the strip from the keyboard, then arrow to the last visible tab.
    await page.keyboard.press('Tab');
    const enteredStrip = await page.evaluate(
      () =>
        document.activeElement?.closest('.astryx-tab-strip') != null &&
        document.activeElement.getAttribute('tabindex') === '0',
    );
    expect(enteredStrip).toBe(true);
    for (let i = 0; i < 20; i += 1) {
      const now = await tabsInView();
      if (now.findIndex(tab => tab.focused) >= lastVisible) {
        break;
      }
      await page.keyboard.press(forward);
    }
    // The next tab is still hidden just before the last press.
    expect((await tabsInView())[lastVisible + 1].visible).toBe(false);
    await page.keyboard.press(forward);
    await page.waitForTimeout(400);
    const after = await tabsInView();
    const focused = after.findIndex(tab => tab.focused);
    test.info().annotations.push({
      type: `overflow-arrow-${direction}`,
      description: JSON.stringify({lastVisible, focused, tab: after[focused]}),
    });
    expect(focused).toBe(lastVisible + 1);
    expect(after[focused].visible).toBe(true);
  });
}
