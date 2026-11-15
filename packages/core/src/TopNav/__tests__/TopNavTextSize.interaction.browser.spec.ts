// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TopNavTextSize.interaction.browser.spec.ts
 * @input The built TopNav stories on a 1280 px desktop viewport, at
 *   Chromium's default font size and at 200% and 250% of it
 * @output Real-browser evidence that no region covers another and the page
 *   does not scroll sideways at a larger text size, and that the bar keeps
 *   one row at the default text size
 * @position Browser proof of TopNav FR3 and FR4's wrap (AST-102 FR4)
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

test.skip(
  ({browserName}) => browserName !== 'chromium',
  'Page.setFontSizes is a Chromium DevTools command',
);

test.use({
  viewport: {width: 1280, height: 800},
  isMobile: false,
  hasTouch: false,
  deviceScaleFactor: 1,
});

/** Sets the browser's default font size, which rem-based text follows. */
async function setDefaultFontSize(page: Page, px: number): Promise<void> {
  const session = await page.context().newCDPSession(page);
  await session.send('Page.setFontSizes', {
    fontSizes: {standard: px, fixed: Math.round((px * 13) / 16)},
  });
}

/** Text boxes of the bar's links and buttons, and the page's width. */
async function readBar(page: Page) {
  return page.evaluate(() => {
    const nav = document.querySelector<HTMLElement>('nav[role="navigation"]');
    if (nav == null) {
      throw new Error('No TopNav');
    }
    const boxes = [...nav.querySelectorAll<HTMLElement>('a, button')]
      .filter(element => element.getBoundingClientRect().width > 0)
      .map(element => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const box = range.getBoundingClientRect();
        return {
          element,
          name: (element.innerText || element.getAttribute('aria-label') || '')
            .trim()
            .slice(0, 24),
          left: box.left,
          right: box.right,
          top: box.top,
          bottom: box.bottom,
        };
      });
    const overlaps: string[] = [];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        if (a.element.contains(b.element) || b.element.contains(a.element)) {
          continue;
        }
        const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (x > 2 && y > 2) {
          overlaps.push(`${a.name} / ${b.name}`);
        }
      }
    }
    return {
      overlaps,
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      // One row: every control's own box shares a vertical band with the
      // first one's.
      oneRow: boxes
        .map(({element}) => element.getBoundingClientRect())
        .every(
          (box, _, [first]) => box.top < first.bottom && box.bottom > first.top,
        ),
    };
  });
}

async function openStory(page: Page, story: string, px: number) {
  await setDefaultFontSize(page, px);
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-topnav--${story}&viewMode=story`,
  );
  await page.locator('nav[role="navigation"]').waitFor();
}

test('at the default text size the full bar keeps one row', async ({page}) => {
  await openStory(page, 'full-example', 16);
  const {overlaps, oneRow} = await readBar(page);
  expect(overlaps).toEqual([]);
  expect(oneRow).toBe(true);
});

for (const story of ['full-example', 'centered-with-start-content']) {
  for (const [size, px] of [
    ['200%', 32],
    ['250%', 40],
  ] as const) {
    test(`at ${size} text size no region covers another: ${story}`, async ({
      page,
    }) => {
      await openStory(page, story, px);
      const {overlaps, scrollWidth, viewportWidth} = await readBar(page);
      expect(overlaps).toEqual([]);
      expect(scrollWidth).toBeLessThanOrEqual(viewportWidth);
    });
  }
}
