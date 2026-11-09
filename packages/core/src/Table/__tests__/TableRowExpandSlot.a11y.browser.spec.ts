// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^packages/core/src/Table/plugins/rowExpansion/ ^packages/core/src/Icon/ComponentIcon ^apps/storybook/stories/TableRowExpansion

/**
 * @file TableRowExpandSlot.a11y.browser.spec.ts
 * @input The built TableRowExpansion IconSlotRowHeight story in real Chromium
 *   and WebKit
 * @output Browser evidence that a theme's `table-row-expand` size request or
 *   `null` changes only the glyph (component:Table FR7): every expandable row
 *   keeps the height it has with the default glyph
 * @position Regression proof for the expansion toggle's vertical alignment
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

test('a theme glyph size or a hidden glyph keeps every expandable row height', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-tablerowexpansion--icon-slot-row-height&viewMode=story`,
  );
  const rowHeight = async (label: string) => {
    const toggle = page
      .getByTestId(`row-expand-${label}`)
      .locator('[data-expansion-toggle]')
      .first();
    await expect(toggle).toBeVisible();
    return toggle.evaluate(
      button => button.closest('tr')?.getBoundingClientRect().height ?? 0,
    );
  };

  const expected = await rowHeight('default');
  expect(expected).toBeGreaterThan(0);
  for (const label of ['sm', 'md', 'lg', 'hidden']) {
    expect(await rowHeight(label), label).toBeCloseTo(expected, 1);
  }
  await expect(
    page
      .getByTestId('row-expand-hidden')
      .locator('[data-expansion-toggle] .astryx-icon'),
  ).toHaveCount(0);
});
