// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/Table/|packages/core/src/virtualization/|apps/storybook/stories/TableVirtualization\.stories)

/**
 * @file TableRowsColumnsWindowing.a11y.chromium.spec.ts
 * @input The built 10,000-row, 300-column Table story that windows both axes, in Chromium
 * @output Evidence that mounted cells stay bounded on both axes, header and
 *   body columns align, row and column positions are full-table, and a
 *   focused cell scrolled out on both axes keeps focus
 * @position Real-engine proof for rows and columns windowing together
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

const STORY = 'core-table-virtualization--rows-and-columns-windowing';
const TABLE_NAME = 'Account metrics by row';
const ROW_HEIGHT = 56;
const ROW_COUNT = 10000;
const COLUMN_COUNT = 302;

interface GridState {
  rowCount: string | null;
  colCount: string | null;
  mountedRows: number;
  mountedColumns: number;
  mountedCells: number;
  maxDrift: number;
  /** Rows whose aria-rowindex disagrees with their place in the body. */
  misplacedRows: number;
  /** Metric columns whose aria-colindex disagrees with their key. */
  misnumberedColumns: number;
  firstWindowRowIndex: number;
  firstWindowColumnIndex: number;
  isSameFocus: boolean;
  focusedRowIndex: string | null;
  focusedColumnIndex: string | null;
}

async function readGrid(page: Page): Promise<GridState> {
  return page
    .getByRole('table', {name: TABLE_NAME})
    .evaluate((table, rowHeight) => {
      const isSpacer = (el: Element) =>
        el.getAttribute('aria-hidden') === 'true';
      const header = (table as HTMLTableElement).rows[0];
      const body = table.querySelector('tbody') as HTMLTableSectionElement;
      const bodyTop = body.getBoundingClientRect().top;
      const rows = Array.from(body.rows).filter(row => !isSpacer(row));
      const headerCells = Array.from(header.cells);
      let maxDrift = 0;
      let misplacedRows = 0;
      let mountedCells = 0;
      for (const row of rows) {
        const index = Number(row.getAttribute('aria-rowindex'));
        const place = (row.getBoundingClientRect().top - bodyTop) / rowHeight;
        if (Math.abs(place - (index - 2)) > 0.05) {
          misplacedRows++;
        }
        Array.from(row.cells).forEach((cell, at) => {
          if (!isSpacer(cell)) {
            mountedCells++;
          }
          const head = headerCells[at].getBoundingClientRect();
          const rect = cell.getBoundingClientRect();
          maxDrift = Math.max(
            maxDrift,
            Math.abs(rect.left - head.left),
            Math.abs(rect.width - head.width),
          );
        });
      }
      const mountedHeader = headerCells.filter(cell => !isSpacer(cell));
      // Metric N sits after the selection, row-number and name columns.
      let misnumberedColumns = 0;
      const offsets = new Set<number>();
      for (const cell of mountedHeader) {
        const match = /^metric(\d+)$/.exec(
          cell.getAttribute('data-column-key') ?? '',
        );
        if (match) {
          offsets.add(
            Number(cell.getAttribute('aria-colindex')) - Number(match[1]),
          );
        }
      }
      if (offsets.size !== 1 || !offsets.has(3)) {
        misnumberedColumns = offsets.size;
      }
      const active = document.activeElement;
      const kept = (window as unknown as {keptFocus?: Element}).keptFocus;
      const windowRows = rows.filter(
        row => Number(row.getAttribute('aria-rowindex')) > 2,
      );
      const windowColumns = mountedHeader.filter(
        cell => Number(cell.getAttribute('aria-colindex')) > 2,
      );
      return {
        rowCount: table.getAttribute('aria-rowcount'),
        colCount: table.getAttribute('aria-colcount'),
        mountedRows: rows.length,
        mountedColumns: mountedHeader.length,
        mountedCells,
        maxDrift,
        misplacedRows,
        misnumberedColumns,
        firstWindowRowIndex: Number(
          windowRows[0]?.getAttribute('aria-rowindex'),
        ),
        firstWindowColumnIndex: Number(
          windowColumns[0]?.getAttribute('aria-colindex'),
        ),
        isSameFocus: kept != null && active === kept && kept.isConnected,
        focusedRowIndex:
          active?.closest('tr')?.getAttribute('aria-rowindex') ?? null,
        focusedColumnIndex:
          active?.closest('td, th')?.getAttribute('aria-colindex') ?? null,
      };
    }, ROW_HEIGHT);
}

async function scrollTo(page: Page, left: number | 'middle', top?: number) {
  await page.getByRole('table', {name: TABLE_NAME}).evaluate(
    (el, target) => {
      const region = el.closest('[role="group"]') as HTMLElement;
      if (target.left === 'middle') {
        region.scrollLeft = (region.scrollWidth - region.clientWidth) / 2;
        region.scrollTop = (region.scrollHeight - region.clientHeight) / 2;
      } else {
        region.scrollLeft = target.left;
        region.scrollTop = target.top ?? 0;
      }
    },
    {left, top},
  );
}

test('10,000 rows by 300 columns window together: bounded cells, aligned columns, full-table positions and kept focus', async ({
  page,
}) => {
  await page.goto(`${storybook.origin}/iframe.html?id=${STORY}&viewMode=story`);
  const table = page.getByRole('table', {name: TABLE_NAME});
  await expect(table).toBeVisible();
  const region = await table.evaluate(el => {
    const node = el.closest('[role="group"]') as HTMLElement;
    return {width: node.clientWidth, height: node.clientHeight};
  });

  const start = await readGrid(page);
  expect(start.rowCount).toBe(String(ROW_COUNT + 1));
  expect(start.colCount).toBe(String(COLUMN_COUNT));
  expect(start.mountedRows).toBeLessThanOrEqual(
    Math.ceil(region.height / ROW_HEIGHT) + 1 + 8 + 1,
  );
  expect(start.mountedColumns).toBeLessThan(25);
  expect(start.maxDrift).toBeLessThanOrEqual(0.5);
  expect(start.misplacedRows).toBe(0);
  expect(start.misnumberedColumns).toBe(0);

  // Focus row 1's checkbox, then scroll it out on both axes.
  const checkbox = table.locator('tbody tr').first().getByRole('checkbox');
  await checkbox.focus();
  await checkbox.evaluate(el => {
    (window as unknown as {keptFocus?: Element}).keptFocus = el;
  });
  const focused = await readGrid(page);
  expect(focused.isSameFocus).toBe(true);
  expect(focused.focusedRowIndex).toBe('2');
  await scrollTo(page, 'middle');
  await expect
    .poll(async () => (await readGrid(page)).firstWindowRowIndex)
    .toBeGreaterThan(4000);
  await expect
    .poll(async () => (await readGrid(page)).firstWindowColumnIndex)
    .toBeGreaterThan(100);
  const middle = await readGrid(page);
  expect(middle.isSameFocus).toBe(true);
  expect(middle.focusedRowIndex).toBe('2');
  expect(middle.focusedColumnIndex).toBe(focused.focusedColumnIndex);
  // The window plus the retained row and column.
  expect(middle.mountedRows).toBeLessThanOrEqual(
    Math.ceil(region.height / ROW_HEIGHT) + 1 + 8 + 1,
  );
  expect(middle.mountedColumns).toBeLessThan(25);
  expect(middle.mountedCells).toBe(middle.mountedRows * middle.mountedColumns);
  expect(middle.maxDrift).toBeLessThanOrEqual(0.5);
  expect(middle.misplacedRows).toBe(0);
  expect(middle.misnumberedColumns).toBe(0);

  await scrollTo(page, 0, 0);
  await expect
    .poll(async () => (await readGrid(page)).firstWindowRowIndex)
    .toBeLessThan(5);
  const back = await readGrid(page);
  expect(back.isSameFocus).toBe(true);
  await expect(checkbox).toBeFocused();

  // A rough per-step cost of a diagonal scroll: 30 steps, each awaited to
  // the second following frame.
  const steps = await table.evaluate(async el => {
    const node = el.closest('[role="group"]') as HTMLElement;
    const frame = async () =>
      new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const durations: number[] = [];
    for (let step = 0; step < 30; step++) {
      const begin = performance.now();
      node.scrollLeft += 240;
      node.scrollTop += 560;
      await frame();
      await frame();
      durations.push(performance.now() - begin);
    }
    durations.sort((a, b) => a - b);
    return {
      p50: durations[Math.floor(durations.length * 0.5)],
      p95: durations[Math.floor(durations.length * 0.95)],
      max: durations[durations.length - 1],
    };
  });
  const afterSteps = await readGrid(page);
  expect(afterSteps.maxDrift).toBeLessThanOrEqual(0.5);
  expect(afterSteps.misplacedRows).toBe(0);

  test.info().annotations.push({
    type: 'rows-columns',
    description: JSON.stringify({region, start, middle, back, steps}),
  });
});
