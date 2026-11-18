// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/Table/|packages/core/src/utils/listWindow|apps/storybook/stories/TableVirtualization\.stories)

/**
 * @file TableWindowedTextSize.a11y.chromium.spec.ts
 * @input The built windowed Table story (2,000 rows at 56px) in Chromium
 * @output Evidence that doubling the text size keeps windowing at the height
 *   the rows share, with contiguous rows and full-table positions, and that
 *   restoring it returns to rowHeight
 * @position Real-engine proof for the measured pitch; jsdom has no layout
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';
import {frames} from '@astryxdesign/interaction-harness';

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

/** Mounted product rows: their full-table positions, tops and heights. */
async function readRows(page: Page) {
  return page.getByRole('table').evaluate(table => {
    const region = table.closest('[role="group"]') as HTMLElement;
    const rows = Array.from(table.querySelectorAll('tbody > tr')).filter(
      row => row.getAttribute('aria-hidden') !== 'true',
    );
    // The first row at least half inside the scroll region's top edge.
    const top = region.getBoundingClientRect().top;
    const firstVisible = rows.find(row => {
      const box = row.getBoundingClientRect();
      return box.bottom > top + box.height / 2;
    });
    return {
      scrollTop: region.scrollTop,
      firstVisible: Number(firstVisible?.getAttribute('aria-rowindex')),
      rows: rows.map(row => {
        const box = row.getBoundingClientRect();
        return {
          index: Number(row.getAttribute('aria-rowindex')),
          top: box.top,
          height: box.height,
        };
      }),
    };
  });
}

function expectSharedPitch(
  rows: {index: number; top: number; height: number}[],
) {
  const pitch = rows[0].height;
  for (const row of rows) {
    expect(Math.abs(row.height - pitch)).toBeLessThanOrEqual(0.75);
  }
  // Consecutive positions sit one pitch apart: no overlap and no gap.
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].index === rows[i - 1].index + 1) {
      expect(Math.abs(rows[i].top - rows[i - 1].top - pitch)).toBeLessThan(1);
    }
  }
  return pitch;
}

test('doubled text size keeps windowing at the height the rows share', async ({
  page,
}) => {
  const fallbacks: string[] = [];
  page.on('console', message => {
    if (message.text().includes('Rendering all rows')) {
      fallbacks.push(message.text());
    }
  });
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-table-virtualization--fixed-height-windowing&viewMode=story`,
  );
  await expect(page.getByRole('table')).toBeVisible();
  await frames(page, 3);
  const before = await readRows(page);
  expect(expectSharedPitch(before.rows)).toBeCloseTo(56, 0);
  expect(before.rows.length).toBeLessThanOrEqual(15);

  // 154% text: every row grows by less than a pixel, which a 2,000-row
  // extent still notices, so windowing continues at the shared height.
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '154%';
  });
  await frames(page, 4);
  const slight = await readRows(page);
  expectSharedPitch(slight.rows);
  expect(slight.rows.length).toBeLessThanOrEqual(15);

  // 200% text: every rem-based size doubles, so every row grows together.
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await frames(page, 4);
  const large = await readRows(page);
  const pitch = expectSharedPitch(large.rows);
  expect(pitch).toBeGreaterThan(56 + 1);
  expect(large.rows.length).toBeLessThanOrEqual(15);

  // Scrolled to the middle, the rows at the top are the ones the measured
  // pitch puts there, with their full-table positions.
  await page.getByRole('table').evaluate((table, top) => {
    (table.closest('[role="group"]') as HTMLElement).scrollTop = top;
  }, 1000 * pitch);
  await frames(page, 4);
  const middle = await readRows(page);
  expectSharedPitch(middle.rows);
  expect(middle.rows.length).toBeLessThanOrEqual(15);
  // Four rows of overscan sit above the first visible row, and the sticky
  // header covers at most two more.
  const expectedFirst = Math.floor(middle.scrollTop / pitch);
  const indices = middle.rows.map(row => row.index - 2);
  expect(indices).toContain(expectedFirst + 1);
  expect(Math.min(...indices)).toBeGreaterThanOrEqual(expectedFirst - 6);
  expect(Math.max(...indices)).toBeLessThanOrEqual(expectedFirst + 12);

  // Restored text: the rows return to 56px, the window follows, and the
  // first visible row stays the same row.
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '';
  });
  await frames(page, 4);
  const restored = await readRows(page);
  expect(expectSharedPitch(restored.rows)).toBeCloseTo(56, 0);
  expect(restored.rows.length).toBeLessThanOrEqual(15);
  expect(restored.firstVisible).toBe(middle.firstVisible);
  expect(fallbacks).toEqual([]);
});
