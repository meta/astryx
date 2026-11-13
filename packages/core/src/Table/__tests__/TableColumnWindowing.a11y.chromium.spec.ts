// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/Table/|packages/core/src/virtualization/|apps/storybook/stories/TableVirtualization\.stories)

/**
 * @file TableColumnWindowing.a11y.chromium.spec.ts
 * @input The built 300-column windowed Table story with a pinned first column, in Chromium
 * @output Evidence that mounted columns stay bounded, header and body columns
 *   align, full-table column positions hold mid-scroll and the pinned column stays
 * @position Real-engine proof for column windowing geometry; jsdom has no layout
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

const COLUMN_COUNT = 300;
const PINNED_WIDTH = 160;
const COLUMN_WIDTH = 120;

interface ColumnState {
  colCount: string | null;
  mounted: number;
  /** Mounted cells and spacers per row, the same in every row when aligned. */
  structures: string[];
  /** Largest inline distance between a header cell and the body cell under it. */
  maxDrift: number;
  /** Full-table position of the first mounted unpinned column. */
  firstUnpinnedIndex: number;
  /** Full-table position of the column just past the pinned column's edge. */
  firstVisibleIndex: number;
  pinnedIndex: string | null;
  pinnedOffset: number;
  scrollLeft: number;
  viewportWidth: number;
}

async function readColumns(page: Page): Promise<ColumnState> {
  return page.getByRole('table').evaluate(table => {
    const region = table.closest('[role="group"]') as HTMLElement;
    const regionLeft = region.getBoundingClientRect().left + region.clientLeft;
    const rows = Array.from((table as HTMLTableElement).rows);
    const header = rows[0];
    const isSpacer = (cell: Element) =>
      cell.getAttribute('aria-hidden') === 'true';
    const structures = rows.map(row =>
      Array.from(row.cells)
        .map(cell =>
          isSpacer(cell) ? 'gap' : cell.getAttribute('aria-colindex'),
        )
        .join(','),
    );
    const headerCells = Array.from(header.cells);
    let maxDrift = 0;
    for (const row of rows.slice(1)) {
      Array.from(row.cells).forEach((cell, index) => {
        const head = headerCells[index];
        maxDrift = Math.max(
          maxDrift,
          Math.abs(
            cell.getBoundingClientRect().left -
              head.getBoundingClientRect().left,
          ),
          Math.abs(
            cell.getBoundingClientRect().width -
              head.getBoundingClientRect().width,
          ),
        );
      });
    }
    const mounted = headerCells.filter(cell => !isSpacer(cell));
    const pinned = mounted[0];
    const unpinned = mounted.slice(1);
    const pinnedRight = pinned.getBoundingClientRect().right;
    const firstVisible = unpinned.find(cell => {
      const rect = cell.getBoundingClientRect();
      return rect.left <= pinnedRight + 1 && rect.right > pinnedRight + 1;
    });
    return {
      colCount: table.getAttribute('aria-colcount'),
      mounted: mounted.length,
      structures,
      maxDrift,
      firstUnpinnedIndex: Number(unpinned[0]?.getAttribute('aria-colindex')),
      firstVisibleIndex: Number(firstVisible?.getAttribute('aria-colindex')),
      pinnedIndex: pinned.getAttribute('aria-colindex'),
      pinnedOffset: pinned.getBoundingClientRect().left - regionLeft,
      scrollLeft: Math.abs(region.scrollLeft),
      viewportWidth: region.clientWidth,
    };
  });
}

test('a 300-column windowed Table keeps mounted columns bounded, aligned and truthfully positioned while it scrolls', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-table-virtualization--column-windowing&viewMode=story`,
  );
  const table = page.getByRole('table', {name: 'Account metrics'});
  await expect(table).toBeVisible();

  const start = await readColumns(page);
  const unpinnedViewport = start.viewportWidth - PINNED_WIDTH;
  // ceil(W / w) + 1 visible, two overscan per side, plus the pinned column.
  const bound = Math.ceil(unpinnedViewport / COLUMN_WIDTH) + 1 + 4 + 1;
  expect(start.colCount).toBe(String(COLUMN_COUNT));
  expect(start.mounted).toBeLessThanOrEqual(bound);
  expect(start.mounted).toBeGreaterThan(2);
  expect(new Set(start.structures).size).toBe(1);
  expect(start.maxDrift).toBeLessThanOrEqual(0.5);
  expect(start.pinnedIndex).toBe('1');
  expect(start.firstUnpinnedIndex).toBe(2);

  // Scroll to the middle and let the window follow.
  await table.evaluate(el => {
    const region = el.closest('[role="group"]') as HTMLElement;
    region.scrollLeft = (region.scrollWidth - region.clientWidth) / 2;
  });
  await expect
    .poll(async () => (await readColumns(page)).firstUnpinnedIndex)
    .toBeGreaterThan(100);
  const middle = await readColumns(page);
  const firstVisibleRunIndex = Math.floor(middle.scrollLeft / COLUMN_WIDTH);
  expect(middle.mounted).toBeLessThanOrEqual(bound);
  expect(new Set(middle.structures).size).toBe(1);
  expect(middle.maxDrift).toBeLessThanOrEqual(0.5);
  // The run starts at column 2, so run column r has aria-colindex r + 2.
  expect(middle.firstVisibleIndex).toBe(firstVisibleRunIndex + 2);
  expect(middle.firstUnpinnedIndex).toBe(firstVisibleRunIndex + 2 - 2);
  expect(middle.pinnedIndex).toBe('1');
  expect(Math.abs(middle.pinnedOffset)).toBeLessThanOrEqual(1);

  test.info().annotations.push({
    type: 'column-windowing',
    description: JSON.stringify({
      viewportWidth: start.viewportWidth,
      bound,
      start: {
        mounted: start.mounted,
        maxDrift: start.maxDrift,
        firstUnpinnedIndex: start.firstUnpinnedIndex,
      },
      middle: {
        scrollLeft: middle.scrollLeft,
        mounted: middle.mounted,
        maxDrift: middle.maxDrift,
        firstVisibleIndex: middle.firstVisibleIndex,
        firstUnpinnedIndex: middle.firstUnpinnedIndex,
        pinnedOffset: middle.pinnedOffset,
      },
    }),
  });
});
