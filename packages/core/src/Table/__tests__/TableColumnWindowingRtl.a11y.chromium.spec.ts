// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/Table/|packages/core/src/virtualization/|apps/storybook/stories/TableVirtualization\.stories)

/**
 * @file TableColumnWindowingRtl.a11y.chromium.spec.ts
 * @input The built 300-column windowed Table stories under a right-to-left
 *   page, in Chromium
 * @output Evidence that column windowing follows a right-to-left scroll, and
 *   that widening and reordering columns write the scroll position back so the
 *   first visible column keeps its place
 * @position Real-engine proof for column windowing under right-to-left; jsdom
 *   has no layout and no right-to-left scroll position
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

function storyUrl(id: string): string {
  return `${storybook.origin}/iframe.html?id=${id}&viewMode=story&globals=direction:rtl`;
}

/**
 * Scrolls the Table's region to `distance` CSS px from its inline start. A
 * right-to-left scroll position is zero at the start and negative after it.
 */
async function scrollFromInlineStart(
  page: Page,
  tableName: string,
  distance: number | 'middle',
) {
  await page.getByRole('table', {name: tableName}).evaluate((el, target) => {
    const region = el.closest('[role="group"]') as HTMLElement;
    const range = region.scrollWidth - region.clientWidth;
    region.scrollLeft = -(target === 'middle' ? range / 2 : target);
  }, distance);
}

interface RtlColumnState {
  direction: string;
  colCount: string | null;
  mounted: number;
  structures: string[];
  /** Largest inline distance between a header cell and the body cell under it. */
  maxDrift: number;
  firstUnpinnedIndex: number;
  /** Full-table position of the column just past the pinned column's inline end. */
  firstVisibleIndex: number;
  pinnedIndex: string | null;
  /** Distance from the pinned column's right edge to the region's right edge. */
  pinnedOffset: number;
  scrollFromStart: number;
  viewportWidth: number;
}

async function readRtlColumns(
  page: Page,
  tableName: string,
): Promise<RtlColumnState> {
  return page.getByRole('table', {name: tableName}).evaluate(table => {
    const region = table.closest('[role="group"]') as HTMLElement;
    const regionRect = region.getBoundingClientRect();
    const regionRight =
      regionRect.left + region.clientLeft + region.clientWidth;
    const rows = Array.from((table as HTMLTableElement).rows);
    const isSpacer = (cell: Element) =>
      cell.getAttribute('aria-hidden') === 'true';
    const structures = rows.map(row =>
      Array.from(row.cells)
        .map(cell =>
          isSpacer(cell) ? 'gap' : cell.getAttribute('aria-colindex'),
        )
        .join(','),
    );
    const headerCells = Array.from(rows[0].cells);
    let maxDrift = 0;
    for (const row of rows.slice(1)) {
      Array.from(row.cells).forEach((cell, index) => {
        const head = headerCells[index].getBoundingClientRect();
        const body = cell.getBoundingClientRect();
        maxDrift = Math.max(
          maxDrift,
          Math.abs(body.right - head.right),
          Math.abs(body.width - head.width),
        );
      });
    }
    const mounted = headerCells.filter(cell => !isSpacer(cell));
    const pinned = mounted[0];
    const unpinned = mounted.slice(1);
    const pinnedLeft = pinned.getBoundingClientRect().left;
    const firstVisible = unpinned.find(cell => {
      const rect = cell.getBoundingClientRect();
      return rect.right >= pinnedLeft - 1 && rect.left < pinnedLeft - 1;
    });
    return {
      direction: getComputedStyle(table).direction,
      colCount: table.getAttribute('aria-colcount'),
      mounted: mounted.length,
      structures,
      maxDrift,
      firstUnpinnedIndex: Number(unpinned[0]?.getAttribute('aria-colindex')),
      firstVisibleIndex: Number(firstVisible?.getAttribute('aria-colindex')),
      pinnedIndex: pinned.getAttribute('aria-colindex'),
      pinnedOffset: regionRight - pinned.getBoundingClientRect().right,
      scrollFromStart: Math.abs(region.scrollLeft),
      viewportWidth: region.clientWidth,
    };
  });
}

/**
 * The column under the viewport's inline start (its right edge), how far it
 * is scrolled past that edge, and the region's distance from its inline start.
 */
async function readRtlAnchor(
  page: Page,
  tableName: string,
): Promise<{key: string | null; fraction: number; scrollFromStart: number}> {
  return page.getByRole('table', {name: tableName}).evaluate(table => {
    const region = table.closest('[role="group"]') as HTMLElement;
    const right =
      region.getBoundingClientRect().left +
      region.clientLeft +
      region.clientWidth;
    const cell = Array.from((table as HTMLTableElement).rows[0].cells).find(
      candidate => {
        const rect = candidate.getBoundingClientRect();
        return (
          candidate.getAttribute('aria-hidden') !== 'true' &&
          rect.right >= right - 0.5 &&
          rect.left < right - 0.5
        );
      },
    );
    const rect = cell?.getBoundingClientRect();
    return {
      key: cell?.getAttribute('data-column-key') ?? null,
      fraction: rect == null ? Number.NaN : (rect.right - right) / rect.width,
      scrollFromStart: Math.abs(region.scrollLeft),
    };
  });
}

test('under right-to-left, a 300-column windowed Table keeps mounted columns bounded, aligned and truthfully positioned while it scrolls', async ({
  page,
}) => {
  const name = 'Account metrics';
  await page.goto(storyUrl('core-table-virtualization--column-windowing'));
  const table = page.getByRole('table', {name});
  await expect(table).toBeVisible();

  const start = await readRtlColumns(page, name);
  const bound =
    Math.ceil((start.viewportWidth - PINNED_WIDTH) / COLUMN_WIDTH) + 1 + 4 + 1;
  expect(start.direction).toBe('rtl');
  expect(start.colCount).toBe(String(COLUMN_COUNT));
  expect(start.mounted).toBeLessThanOrEqual(bound);
  expect(new Set(start.structures).size).toBe(1);
  expect(start.maxDrift).toBeLessThanOrEqual(0.5);
  expect(start.pinnedIndex).toBe('1');
  expect(start.firstUnpinnedIndex).toBe(2);

  await scrollFromInlineStart(page, name, 'middle');
  await expect
    .poll(async () => (await readRtlColumns(page, name)).firstUnpinnedIndex)
    .toBeGreaterThan(100);
  const middle = await readRtlColumns(page, name);
  const firstVisibleRunIndex = Math.floor(
    middle.scrollFromStart / COLUMN_WIDTH,
  );
  expect(middle.mounted).toBeLessThanOrEqual(bound);
  expect(new Set(middle.structures).size).toBe(1);
  expect(middle.maxDrift).toBeLessThanOrEqual(0.5);
  // The run starts at column 2, so run column r has aria-colindex r + 2.
  expect(middle.firstVisibleIndex).toBe(firstVisibleRunIndex + 2);
  expect(middle.firstUnpinnedIndex).toBe(firstVisibleRunIndex + 2 - 2);
  expect(middle.pinnedIndex).toBe('1');
  expect(Math.abs(middle.pinnedOffset)).toBeLessThanOrEqual(1);

  test.info().annotations.push({
    type: 'column-windowing-rtl',
    description: JSON.stringify({bound, start, middle}),
  });
});

test('under right-to-left, widening and reordering columns write the scroll position back so the first visible column keeps its place', async ({
  page,
}) => {
  const name = 'Selectable account metrics';
  await page.goto(
    storyUrl('core-table-virtualization--column-windowing-focus'),
  );
  const table = page.getByRole('table', {name});
  await expect(table).toBeVisible();
  expect(await table.evaluate(el => getComputedStyle(el).direction)).toBe(
    'rtl',
  );

  await scrollFromInlineStart(page, name, 100 * COLUMN_WIDTH + 50);
  await expect
    .poll(async () => (await readRtlAnchor(page, name)).key)
    .toMatch(/^metric/);
  const before = await readRtlAnchor(page, name);

  // The first 40 columns sit before the anchor and grow to 200 px: the
  // 160 px name column by 40 px and 39 metric columns by 80 px each. Keeping
  // the anchor in place moves the scroll position 3,160 px further from the
  // inline start.
  await page.getByRole('button', {name: 'Widen the first 40 columns'}).click();
  await expect
    .poll(async () => (await readRtlAnchor(page, name)).key)
    .toBe(before.key);
  const widened = await readRtlAnchor(page, name);
  expect(Math.abs(widened.fraction - before.fraction)).toBeLessThan(0.02);
  expect(
    Math.abs(widened.scrollFromStart - before.scrollFromStart - 3160),
  ).toBeLessThanOrEqual(2);

  await page
    .getByRole('button', {name: 'Move the first column to the end'})
    .click();
  await expect
    .poll(async () => (await readRtlAnchor(page, name)).key)
    .toBe(before.key);
  const reordered = await readRtlAnchor(page, name);
  expect(Math.abs(reordered.fraction - before.fraction)).toBeLessThan(0.02);

  test.info().annotations.push({
    type: 'column-anchor-rtl',
    description: JSON.stringify({before, widened, reordered}),
  });
});
