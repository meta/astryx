// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ToolbarTextSize.interaction.browser.spec.ts
 * @input The built Toolbar Three Slot story on a 402 px viewport, at
 *   Chromium's default font size and at 165% and 194% of it (iOS Dynamic Type
 *   AX1 and AX2 relative to the default body size)
 * @output Real-browser evidence that the three lanes never overlap or leave
 *   the screen, that the row wraps when they do not fit, and that the center
 *   sits at the toolbar's middle at the default text size
 * @position Browser proof of Toolbar FR2's wrap (AST-102 FR4)
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

test.use({viewport: {width: 402, height: 874}});

/** Sets the browser's default font size, which rem-based text follows. */
async function setDefaultFontSize(page: Page, px: number): Promise<void> {
  const session = await page.context().newCDPSession(page);
  await session.send('Page.setFontSizes', {
    fontSizes: {standard: px, fixed: Math.round((px * 13) / 16)},
  });
}

/** Each lane's text and controls as boxes, plus the toolbar's box. */
async function readLanes(page: Page) {
  return page.evaluate(() => {
    const toolbar = document.querySelector<HTMLElement>('[role="toolbar"]');
    if (toolbar == null) {
      throw new Error('No toolbar');
    }
    const toolbarBox = toolbar.getBoundingClientRect();
    // The three lane elements; the keyboard hint is not a lane.
    const lanes = [...toolbar.children]
      .filter((lane): lane is HTMLElement => lane instanceof HTMLElement)
      .slice(0, 3)
      .map(lane => {
        const range = document.createRange();
        range.selectNodeContents(lane);
        const box = range.getBoundingClientRect();
        return {
          text: lane.innerText.trim(),
          left: box.left,
          right: box.right,
          top: box.top,
          bottom: box.bottom,
        };
      });
    return {
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      toolbarCenter: (toolbarBox.left + toolbarBox.right) / 2,
      lanes,
    };
  });
}

async function openThreeSlot(page: Page, px: number): Promise<void> {
  await setDefaultFontSize(page, px);
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-toolbar--three-slot&viewMode=story`,
  );
  await page.locator('[role="toolbar"]').waitFor();
}

test('at the default text size the center sits at the middle', async ({
  page,
}) => {
  // Wide enough that the start and end lanes share the rest equally.
  await page.setViewportSize({width: 1024, height: 768});
  await openThreeSlot(page, 16);
  const {lanes, toolbarCenter} = await readLanes(page);
  expect(lanes).toHaveLength(3);
  const center = lanes[1];
  expect(
    Math.abs((center.left + center.right) / 2 - toolbarCenter),
  ).toBeLessThan(1);
  expect(new Set(lanes.map(lane => Math.round(lane.top))).size).toBe(1);
});

for (const [size, px] of [
  ['165%', 26],
  ['194%', 31],
] as const) {
  test(`at ${size} text size no lane overlaps another or leaves the screen`, async ({
    page,
  }) => {
    await openThreeSlot(page, px);
    const {scrollWidth, viewportWidth, lanes} = await readLanes(page);
    expect(scrollWidth).toBeLessThanOrEqual(viewportWidth);
    for (const lane of lanes) {
      expect(lane.left, lane.text).toBeGreaterThanOrEqual(0);
      expect(lane.right, lane.text).toBeLessThanOrEqual(viewportWidth);
    }
    for (let i = 0; i < lanes.length; i++) {
      for (let j = i + 1; j < lanes.length; j++) {
        const a = lanes[i];
        const b = lanes[j];
        const overlapsX =
          Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1;
        const overlapsY =
          Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
        expect(overlapsX && overlapsY, `${a.text} / ${b.text}`).toBe(false);
      }
    }
  });
}
