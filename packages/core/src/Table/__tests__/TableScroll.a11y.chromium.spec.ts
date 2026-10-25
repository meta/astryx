// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file TableScroll.a11y.chromium.spec.ts
 * @input Built responsive Table story and real Chromium wheel input
 * @output Browser evidence for conditional inline containment and scroll chaining
 * @position Table integration proof for the shared useScrollableArea behavior
 */

import {expect, test, type Locator, type Page} from '@playwright/test';
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

async function mount(page: Page) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-table--responsive-scroll&viewMode=story`,
  );
  const wrappers = page.locator('.astryx-table-scroll-wrapper');
  await expect(wrappers).toHaveCount(3);
  return wrappers;
}

async function putInsideOuterScroller(
  page: Page,
  viewport: Locator,
  viewportWidth: number,
  contentWidth: number,
  tableWidth: number,
) {
  await viewport.evaluate(
    (node, sizes) => {
      const outer = document.createElement('div');
      outer.dataset.tableScrollOuter = '';
      outer.style.inlineSize = `${sizes.viewportWidth}px`;
      outer.style.overflowX = 'auto';
      const content = document.createElement('div');
      content.style.inlineSize = `${sizes.contentWidth}px`;
      node.parentElement?.insertBefore(outer, node);
      outer.append(content);
      content.append(node);
      (node as HTMLElement).style.inlineSize = `${sizes.tableWidth}px`;
    },
    {viewportWidth, contentWidth, tableWidth},
  );
  return page.locator('[data-table-scroll-outer]');
}

async function wheelInline(page: Page, target: Locator) {
  const box = await target.boundingBox();
  if (box == null) {
    throw new Error('Table scroll viewport has no rendered bounds');
  }
  await page.mouse.move(box.x + Math.min(box.width / 2, 100), box.y + 20);
  await page.mouse.wheel(200, 0);
}

test('an overflowing table contains horizontal wheel input at its edge', async ({
  page,
}) => {
  const wrappers = await mount(page);
  const tableViewport = wrappers.nth(0);
  await tableViewport.locator('table').evaluate(table => {
    const viewport = table.closest<HTMLElement>('.astryx-table-scroll-wrapper');
    if (viewport != null) {
      table.style.minWidth = `${viewport.clientWidth + 400}px`;
    }
  });
  await expect(tableViewport).toHaveAttribute('data-scrollable-inline', 'true');
  await expect(tableViewport).toHaveAttribute('tabindex', '0');
  await expect
    .poll(async () =>
      tableViewport.evaluate(
        element => getComputedStyle(element).overscrollBehaviorX,
      ),
    )
    .toBe('contain');

  const outer = await putInsideOuterScroller(
    page,
    tableViewport,
    320,
    800,
    320,
  );
  await tableViewport.evaluate(element => {
    element.scrollLeft = element.scrollWidth - element.clientWidth;
  });
  await wheelInline(page, tableViewport);
  await expect
    .poll(async () => outer.evaluate(element => element.scrollLeft))
    .toBe(0);
});

test('a fitting table passes horizontal wheel input to its outer scroller', async ({
  page,
}) => {
  const wrappers = await mount(page);
  const tableViewport = wrappers.nth(2);
  const outer = await putInsideOuterScroller(
    page,
    tableViewport,
    320,
    800,
    800,
  );

  await expect(tableViewport).not.toHaveAttribute(
    'data-scrollable-inline',
    'true',
  );
  await expect(tableViewport).not.toHaveAttribute('tabindex');
  await expect
    .poll(async () =>
      tableViewport.evaluate(
        element => getComputedStyle(element).overscrollBehaviorX,
      ),
    )
    .toBe('auto');

  await wheelInline(page, tableViewport);
  await expect
    .poll(async () => outer.evaluate(element => element.scrollLeft))
    .toBeGreaterThan(0);
});
