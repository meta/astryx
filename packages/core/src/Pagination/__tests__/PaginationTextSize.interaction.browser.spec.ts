// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PaginationTextSize.interaction.browser.spec.ts
 * @input The built Pagination stories on a 402 px viewport, at Chromium's
 *   default font size and at 165% and 194% of it (iOS Dynamic Type AX1 and
 *   AX2 relative to the default body size)
 * @output Real-browser evidence that the row wraps instead of scrolling the
 *   page sideways, keeps Previous first and Next last, and stays on one line
 *   at the default text size
 * @position Browser proof of Pagination FR15 (AST-102 FR4)
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

test.use({viewport: {width: 402, height: 874}});

/** Sets the browser's default font size, which rem-based text follows. */
async function setDefaultFontSize(page: Page, px: number): Promise<void> {
  const session = await page.context().newCDPSession(page);
  await session.send('Page.setFontSizes', {
    fontSizes: {standard: px, fixed: Math.round((px * 13) / 16)},
  });
}

async function openPages(page: Page, px: number): Promise<void> {
  await setDefaultFontSize(page, px);
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-pagination--default&viewMode=story`,
  );
  await page.locator('nav button').first().waitFor();
}

/** The landmark's buttons in DOM order, with their boxes. */
async function readButtons(page: Page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    buttons: [
      ...document.querySelectorAll<HTMLElement>('#storybook-root nav button'),
    ].map(button => {
      const box = button.getBoundingClientRect();
      return {
        name: button.getAttribute('aria-label') ?? button.textContent ?? '',
        left: box.left,
        right: box.right,
        top: box.top,
      };
    }),
  }));
}

test('at the default text size the row stays on one line', async ({page}) => {
  await openPages(page, 16);
  const {buttons} = await readButtons(page);
  const tops = new Set(buttons.map(button => Math.round(button.top)));
  expect(tops.size).toBe(1);
});

for (const [size, px] of [
  ['165%', 26],
  ['194%', 31],
] as const) {
  test(`at ${size} text size the row wraps and keeps every control on screen`, async ({
    page,
  }) => {
    await openPages(page, px);
    const {scrollWidth, viewportWidth, buttons} = await readButtons(page);
    expect(scrollWidth).toBeLessThanOrEqual(viewportWidth);
    for (const button of buttons) {
      expect(button.left, button.name).toBeGreaterThanOrEqual(0);
      expect(button.right, button.name).toBeLessThanOrEqual(viewportWidth);
    }
    expect(buttons[0].name).toMatch(/previous/i);
    expect(buttons[buttons.length - 1].name).toMatch(/next/i);
  });
}
