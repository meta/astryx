// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/Table/|packages/core/src/ContextMenu/|apps/storybook/stories/TableColumnResize\.stories)

/**
 * @file TableColumnResizeEdge.a11y.chromium.spec.ts
 * @input Storybook story core-tablecolumnresize--with-sortable-columns: a
 *   Table whose sortable and plain columns both resize
 * @output Proof that every resize boundary sits on its column's trailing
 *   edge, in both directions, and that a sortable header's context menu still
 *   opens at the pointer
 * @position Real-browser geometry check; jsdom lays nothing out.
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

async function openStory(page: Page, direction: 'ltr' | 'rtl'): Promise<void> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-tablecolumnresize--with-sortable-columns&viewMode=story&globals=direction:${direction}`,
    {waitUntil: 'load'},
  );
  await expect(page.getByRole('separator').first()).toBeAttached();
}

for (const direction of ['ltr', 'rtl'] as const) {
  test(`every resize boundary sits on its column's trailing edge (${direction})`, async ({
    page,
  }) => {
    await openStory(page, direction);
    const gaps = await page.getByRole('separator').evaluateAll(handles =>
      handles.map(handle => {
        const cell = handle.closest('th');
        if (cell == null) {
          return {header: '', gap: Number.NaN};
        }
        const isRtl = getComputedStyle(cell).direction === 'rtl';
        const cellBox = cell.getBoundingClientRect();
        const handleBox = handle.getBoundingClientRect();
        const style = getComputedStyle(cell);
        // The padding box's trailing edge: the column divider is outside it.
        const cellEnd = isRtl
          ? cellBox.left + parseFloat(style.borderLeftWidth)
          : cellBox.right - parseFloat(style.borderRightWidth);
        const handleEnd = isRtl ? handleBox.left : handleBox.right;
        return {
          header: cell.textContent?.trim() ?? '',
          gap: Math.abs(cellEnd - handleEnd),
          isRtl,
        };
      }),
    );
    // Name and Email resize; Role is the last proportional column.
    expect(gaps.length).toBeGreaterThanOrEqual(2);
    for (const {header, gap, isRtl} of gaps) {
      expect(isRtl, header).toBe(direction === 'rtl');
      expect(
        gap,
        `${header} boundary offset from its column edge`,
      ).toBeLessThanOrEqual(1);
    }
  });
}

test("a sortable header's context menu opens at the pointer", async ({
  page,
}) => {
  await openStory(page, 'ltr');
  const header = page.getByRole('columnheader', {name: /Name/});
  const box = await header.boundingBox();
  if (box == null) {
    throw new Error('no Name header');
  }
  const point = {
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2),
  };
  await page.mouse.click(point.x, point.y, {button: 'right'});
  await expect(page.getByRole('menu')).toBeVisible();
  const anchor = await page
    .locator('span[aria-hidden="true"][style*="anchor-name"]')
    .boundingBox();
  // The menu hangs from a 1px anchor placed at the pointer.
  expect(anchor?.x).toBeCloseTo(point.x, 0);
  expect(anchor?.y).toBeCloseTo(point.y, 0);
});
