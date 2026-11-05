// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^packages/core/src/Table/plugins/sortable/ ^packages/core/src/Icon/ComponentIcon ^apps/storybook/stories/TableSortable

/**
 * @file TableSortIndicatorSlot.a11y.browser.spec.ts
 * @input The built TableSortable IndicatorSlotSize story in real Chromium and
 *   WebKit
 * @output Browser evidence that a theme's `table-sort-indicator` size request
 *   changes only the glyph (component:Table FR5): the Sort control and the
 *   header row keep the height they have with the default glyph; a hidden
 *   glyph leaves no gap beside the label
 * @position Regression proof for the sort indicator wrapper's fixed block size
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

test('a large sort indicator glyph keeps the Sort control and header height', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-tablesortable--indicator-slot-size&viewMode=story`,
  );
  const measure = async (testId: string) => {
    const table = page.getByTestId(testId);
    const header = table.getByRole('columnheader', {name: 'Name'});
    const control = header.getByRole('button', {name: 'Name'});
    const glyph = control.locator('.astryx-icon');
    await expect(glyph).toBeVisible();
    const [headerBox, controlBox, glyphBox] = await Promise.all([
      header.boundingBox(),
      control.boundingBox(),
      glyph.boundingBox(),
    ]);
    return {
      header: headerBox?.height,
      control: controlBox?.height,
      glyph: glyphBox?.height,
    };
  };

  const normal = await measure('default-indicator');
  const large = await measure('large-indicator');

  // The slot reached the glyph.
  expect(large.glyph).toBeGreaterThan(normal.glyph ?? Infinity);
  // The control and the row around it did not move.
  expect(large.control).toBeCloseTo(normal.control ?? 0, 1);
  expect(large.header).toBeCloseTo(normal.header ?? 0, 1);
});

test('a hidden sort indicator leaves no gap beside the label', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-tablesortable--indicator-slot-size&viewMode=story`,
  );
  const control = page
    .getByTestId('hidden-indicator')
    .getByRole('columnheader', {name: 'Name'})
    .getByRole('button', {name: 'Name'});
  await expect(control).toBeVisible();
  // The label is the control's only laid-out child: the empty indicator
  // wrapper collapses, so the button's gap does not follow the label.
  const laidOut = await control.evaluate(
    button =>
      [...button.children].filter(child => child.getClientRects().length > 0)
        .length,
  );
  expect(laidOut).toBe(1);
  await expect(control.locator('.astryx-icon')).toHaveCount(0);
});
