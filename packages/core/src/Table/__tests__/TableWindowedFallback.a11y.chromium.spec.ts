// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/Table/|packages/core/src/Card/|apps/storybook/stories/TableVirtualization\.stories)

/**
 * @file TableWindowedFallback.a11y.chromium.spec.ts
 * @input The built story of a Table asked to window that falls back (wrapped
 *   text) inside a 400px Card, in Chromium
 * @output Evidence that the fallback renders every row inside the Card's
 *   height, in a scroll region that still scrolls, instead of past the Card
 * @position Real-engine proof for the fallback's block size; jsdom has no layout
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

test('a Table that falls back keeps the Card height and scrolls inside it', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-table-virtualization--fallback-in-sized-card&viewMode=story`,
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
      cardHeight: c.height,
      scrolls: region.scrollHeight > region.clientHeight + 1,
      rows,
    };
  });
  // Every row renders, and the region still ends at the Card's bottom edge.
  expect(fit.rows).toBe(2000);
  expect(fit.cardHeight).toBeCloseTo(400, 0);
  expect(Math.abs(fit.top - fit.bottom)).toBeLessThanOrEqual(1);
  expect(fit.scrolls).toBe(true);
});
