// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y always

/**
 * @file DiffRowPaint.a11y.chromium.spec.ts
 * @input Built CodeBlock diff story with lines longer than a phone viewport
 * @output Browser evidence that a changed row's paint spans the full scroll width
 * @position CodeBlock FR9 proof: row paint follows a scrolled line, and wraps
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

async function mount(page: Page, wrapped: boolean) {
  await page.setViewportSize({width: 390, height: 700});
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-codeblock--diff-long-lines&viewMode=story&args=isWrapped:${wrapped}`,
  );
  await expect(page.locator('[data-diff="added"]')).toHaveCount(1);
}

/** The painted rows, the scroll container, and the widths that matter. */
async function measure(page: Page) {
  return page.evaluate(() => {
    const scroller = document.querySelector('[role="group"]') as HTMLElement;
    const rows = ['added', 'removed'].map(kind => {
      const row = document.querySelector(
        `[data-diff="${kind}"]`,
      ) as HTMLElement;
      const rect = row.getBoundingClientRect();
      return {
        kind,
        width: Math.round(rect.width),
        lines: Math.round(
          rect.height / parseFloat(getComputedStyle(row).lineHeight),
        ),
      };
    });
    return {
      clientWidth: scroller.clientWidth,
      scrollWidth: scroller.scrollWidth,
      rows,
    };
  });
}

test("a changed row's paint spans the full scroll width of a long line", async ({
  page,
}) => {
  await mount(page, false);
  const before = await measure(page);
  // The line really overflows a phone viewport.
  expect(before.scrollWidth).toBeGreaterThan(before.clientWidth + 100);
  // Each painted row is as wide as the scrollable content, not the viewport.
  for (const row of before.rows) {
    expect(row.width).toBeGreaterThanOrEqual(before.scrollWidth - 1);
  }
  // Scrolled to the end, the rows still cover what is on screen.
  await page.evaluate(() => {
    const scroller = document.querySelector('[role="group"]') as HTMLElement;
    scroller.scrollLeft = scroller.scrollWidth;
  });
  const after = await measure(page);
  for (const row of after.rows) {
    expect(row.width).toBeGreaterThanOrEqual(after.scrollWidth - 1);
  }
});

test('in wrapped mode the rows wrap and still paint their full width', async ({
  page,
}) => {
  await mount(page, true);
  const m = await measure(page);
  // Nothing scrolls: the long line wrapped.
  expect(m.scrollWidth).toBeLessThanOrEqual(m.clientWidth + 1);
  for (const row of m.rows) {
    expect(row.lines).toBeGreaterThan(1);
    expect(row.width).toBeGreaterThanOrEqual(m.clientWidth - 1);
  }
});
