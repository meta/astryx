// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/Table/|packages/core/src/Card/|apps/storybook/stories/TableVirtualization\.stories)

/**
 * @file TableWindowedCard.a11y.chromium.spec.ts
 * @input The built windowed Table story inside a 400px Card, in Chromium
 * @output Evidence that the windowed scroll region reaches the Card's block
 *   edges the same way at the top and the bottom, and still windows
 * @position Real-engine proof for the region's block size; jsdom has no layout
 */

import {expect, test} from '@astryxdesign/a11y-spec/playwright';
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

test('in a sized Card, the windowed scroll region ends at the bottom edge as it starts at the top', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-table-virtualization--in-sized-card&viewMode=story`,
  );
  const table = page.getByRole('table');
  await expect(table).toBeVisible();
  const fit = await table.evaluate(el => {
    const region = el.closest('[role="group"]') as HTMLElement;
    const card = region.parentElement as HTMLElement;
    const r = region.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    const rows = Array.from(el.querySelectorAll('tbody > tr')).filter(
      row => row.getAttribute('aria-hidden') !== 'true',
    ).length;
    return {
      top: r.top - c.top,
      bottom: c.bottom - r.bottom,
      regionHeight: r.height,
      cardHeight: c.height,
      scrolls: region.scrollHeight > region.clientHeight + 1,
      rows,
    };
  });
  // The region bleeds over the Card's padding at both block edges, so the
  // inset from the Card's edge is the same at the top and the bottom.
  expect(Math.abs(fit.top - fit.bottom)).toBeLessThanOrEqual(1);
  expect(fit.cardHeight).toBeCloseTo(400, 0);
  expect(fit.regionHeight).toBeGreaterThan(fit.cardHeight - 2 * fit.top - 1);
  expect(fit.scrolls).toBe(true);
  expect(fit.rows).toBeLessThan(100);
});
