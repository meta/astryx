// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/Table/|packages/core/src/virtualization/|apps/storybook/stories/TableVirtualization\.stories)

/**
 * @file TableColumnWindowFocus.a11y.chromium.spec.ts
 * @input The built 300-column windowed Table story with row selection, in Chromium
 * @output Evidence that a focused checkbox keeps its element and focus while
 *   its column scrolls far out of range and back, and that widening and
 *   reordering columns keep the first visible column and its offset
 * @position Real-engine proof for the retained focused column and the inline anchor
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

const STORY = 'core-table-virtualization--column-windowing-focus';
const TABLE_NAME = 'Selectable account metrics';
const COLUMN_WIDTH = 120;

async function scrollRegion(page: Page, to: 'start' | 'end' | number) {
  await page.getByRole('table', {name: TABLE_NAME}).evaluate((el, target) => {
    const region = el.closest('[role="group"]') as HTMLElement;
    region.scrollLeft =
      target === 'start'
        ? 0
        : target === 'end'
          ? region.scrollWidth - region.clientWidth
          : target;
  }, to);
}

interface WindowState {
  mounted: number;
  spacers: number;
  firstMountedIndex: number;
  isSameFocus: boolean;
  focusedColumnIndex: string | null;
}
async function readWindow(page: Page): Promise<WindowState> {
  return page.getByRole('table', {name: TABLE_NAME}).evaluate(table => {
    const header = (table as HTMLTableElement).rows[0];
    const cells = Array.from(header.cells);
    const mounted = cells.filter(c => c.getAttribute('aria-hidden') !== 'true');
    const active = document.activeElement;
    const kept = (window as unknown as {keptFocus?: Element}).keptFocus;
    return {
      mounted: mounted.length,
      spacers: cells.length - mounted.length,
      firstMountedIndex: Number(mounted[1]?.getAttribute('aria-colindex')),
      isSameFocus: kept != null && active === kept && kept.isConnected,
      focusedColumnIndex:
        active?.closest('td, th')?.getAttribute('aria-colindex') ?? null,
    };
  });
}

/** The column under the viewport's inline start, and how far it is scrolled. */
async function readAnchor(
  page: Page,
): Promise<{key: string | null; fraction: number}> {
  return page.getByRole('table', {name: TABLE_NAME}).evaluate(table => {
    const region = table.closest('[role="group"]') as HTMLElement;
    const left = region.getBoundingClientRect().left + region.clientLeft;
    const cell = Array.from((table as HTMLTableElement).rows[0].cells).find(
      candidate => {
        const rect = candidate.getBoundingClientRect();
        return (
          candidate.getAttribute('aria-hidden') !== 'true' &&
          rect.left <= left + 0.5 &&
          rect.right > left + 0.5
        );
      },
    );
    const rect = cell?.getBoundingClientRect();
    return {
      key: cell?.getAttribute('data-column-key') ?? null,
      fraction: rect == null ? Number.NaN : (left - rect.left) / rect.width,
    };
  });
}

test('a focused checkbox keeps its element and focus while its column scrolls far out of range and back', async ({
  page,
}) => {
  await page.goto(`${storybook.origin}/iframe.html?id=${STORY}&viewMode=story`);
  const table = page.getByRole('table', {name: TABLE_NAME});
  await expect(table).toBeVisible();
  const checkbox = table.locator('tbody tr').first().getByRole('checkbox');
  await checkbox.focus();
  await checkbox.evaluate(el => {
    (window as unknown as {keptFocus?: Element}).keptFocus = el;
  });
  const start = await readWindow(page);
  expect(start.isSameFocus).toBe(true);
  expect(start.focusedColumnIndex).toBe('1');

  await scrollRegion(page, 'end');
  await expect
    .poll(async () => (await readWindow(page)).firstMountedIndex)
    .toBeGreaterThan(250);
  const far = await readWindow(page);
  const viewportWidth = await table.evaluate(
    el => (el.closest('[role="group"]') as HTMLElement).clientWidth,
  );
  // The range bound plus the one retained column.
  const bound = Math.ceil(viewportWidth / COLUMN_WIDTH) + 1 + 4 + 1;
  expect(far.isSameFocus).toBe(true);
  expect(far.focusedColumnIndex).toBe('1');
  expect(far.mounted).toBeLessThanOrEqual(bound);
  // A spacer between the retained column and the range; the range reaches the end.
  expect(far.spacers).toBeGreaterThanOrEqual(1);
  expect(far.spacers).toBeLessThanOrEqual(3);

  await scrollRegion(page, 'start');
  await expect
    .poll(async () => (await readWindow(page)).firstMountedIndex)
    .toBeLessThan(5);
  const back = await readWindow(page);
  expect(back.isSameFocus).toBe(true);
  await expect(checkbox).toBeFocused();

  test.info().annotations.push({
    type: 'column-focus',
    description: JSON.stringify({viewportWidth, bound, start, far, back}),
  });
});

test('widening and reordering columns keep the first visible column and its offset', async ({
  page,
}) => {
  await page.goto(`${storybook.origin}/iframe.html?id=${STORY}&viewMode=story`);
  const table = page.getByRole('table', {name: TABLE_NAME});
  await expect(table).toBeVisible();
  await scrollRegion(page, 100 * COLUMN_WIDTH + 50);
  await expect
    .poll(async () => (await readAnchor(page)).key)
    .toMatch(/^metric/);
  const before = await readAnchor(page);

  await page.getByRole('button', {name: 'Widen the first 40 columns'}).click();
  await expect.poll(async () => (await readAnchor(page)).key).toBe(before.key);
  const widened = await readAnchor(page);
  expect(Math.abs(widened.fraction - before.fraction)).toBeLessThan(0.02);

  await page
    .getByRole('button', {name: 'Move the first column to the end'})
    .click();
  await expect.poll(async () => (await readAnchor(page)).key).toBe(before.key);
  const reordered = await readAnchor(page);
  expect(Math.abs(reordered.fraction - before.fraction)).toBeLessThan(0.02);

  test.info().annotations.push({
    type: 'column-anchor',
    description: JSON.stringify({before, widened, reordered}),
  });
});
