// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DateRangeInputReflow.interaction.browser.spec.ts
 * @input Storybook story core-daterangeinput--with-presets-and-value
 * @output In a real browser: on a 390 px wide page the preset group stacks
 *   above the calendar, and every month grid and the month navigation stay
 *   inside the layer; on a desktop page the presets stay beside the calendar.
 * @position DateRangeInput reflow evidence (WCAG 1.4.10), run in the Chromium
 *   interaction lane; jsdom has no layout.
 */

import {expect, test, type Locator, type Page} from '@playwright/test';
import {openStory, withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

type Box = {left: number; top: number; right: number; bottom: number};

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (box == null) {
    throw new Error('element has no layout box');
  }
  return {
    left: box.x,
    top: box.y,
    right: box.x + box.width,
    bottom: box.y + box.height,
  };
}

function expectInside(inner: Box, outer: Box) {
  expect(inner.left).toBeGreaterThanOrEqual(outer.left - 0.5);
  expect(inner.right).toBeLessThanOrEqual(outer.right + 0.5);
}

async function openPicker(page: Page) {
  await openStory(
    page,
    storybook(),
    'core-daterangeinput--with-presets-and-value',
  );
  const trigger = page.locator('[aria-haspopup]').first();
  await trigger.waitFor();
  await trigger.click();
  const presets = page.getByRole('group', {name: /preset/i});
  await presets.waitFor();
  const layer = page.locator('[popover]:popover-open');
  return {presets, layer, grids: layer.getByRole('grid')};
}

test.describe('on a 390 px wide page', () => {
  test.use({
    isMobile: false,
    hasTouch: false,
    viewport: {width: 390, height: 844},
  });

  test('the presets stack above the calendar, which stays inside the layer', async ({
    page,
  }) => {
    const {presets, layer, grids} = await openPicker(page);
    const layerBox = await boxOf(layer);
    const presetBox = await boxOf(presets);
    const gridCount = await grids.count();
    expect(gridCount).toBeGreaterThan(0);
    for (let index = 0; index < gridCount; index++) {
      const gridBox = await boxOf(grids.nth(index));
      expectInside(gridBox, layerBox);
      expect(presetBox.bottom).toBeLessThanOrEqual(gridBox.top + 0.5);
    }
    const nextMonth = layer.getByRole('button', {name: /next/i});
    expectInside(await boxOf(nextMonth), layerBox);
  });
});

test.describe('on a desktop page', () => {
  test.use({
    isMobile: false,
    hasTouch: false,
    viewport: {width: 1024, height: 768},
  });

  test('the presets stay beside the calendar', async ({page}) => {
    const {presets, grids} = await openPicker(page);
    const presetBox = await boxOf(presets);
    const gridBox = await boxOf(grids.first());
    expect(presetBox.right).toBeLessThanOrEqual(gridBox.left + 0.5);
    expect(presetBox.top).toBeLessThan(gridBox.top);
  });
});
