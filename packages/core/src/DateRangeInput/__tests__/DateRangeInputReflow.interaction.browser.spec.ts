// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DateRangeInputReflow.interaction.browser.spec.ts
 * @input Storybook story core-daterangeinput--with-presets-and-value
 * @output In a real browser: on a 390 px wide page the preset group stacks
 *   above the calendar, and every month grid and the month navigation stay
 *   inside the layer; on a short phone screen the layer stays on screen and
 *   its content scrolls to the last month; where the presets fit beside a
 *   one-month calendar (440 px) and on a desktop page they stay beside it,
 *   with nothing in the popover scrolling.
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
  expect(inner.top).toBeGreaterThanOrEqual(outer.top - 0.5);
  expect(inner.bottom).toBeLessThanOrEqual(outer.bottom + 0.5);
}

/** Whether anything in the popover scrolls (a scrollbar on classic-scrollbar
 * systems). */
async function hasScrollableOverflow(layer: Locator): Promise<boolean> {
  return layer.evaluate(root =>
    [root, ...Array.from(root.querySelectorAll('*'))].some(node => {
      const style = getComputedStyle(node);
      const scrolls = /auto|scroll/.test(style.overflowX + style.overflowY);
      return (
        scrolls &&
        (node.scrollHeight > node.clientHeight + 0.5 ||
          node.scrollWidth > node.clientWidth + 0.5)
      );
    }),
  );
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
  const layer = page.getByRole('dialog');
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

test.describe('on a short phone screen, 390 by 664 px', () => {
  test.use({
    isMobile: false,
    hasTouch: false,
    viewport: {width: 390, height: 664},
  });

  test('the layer stays on screen and scrolls to the last month', async ({
    page,
  }) => {
    const {layer, grids} = await openPicker(page);
    const layerBox = await boxOf(layer);
    expect(layerBox.top).toBeGreaterThanOrEqual(0);
    expect(layerBox.bottom).toBeLessThanOrEqual(664);
    const lastGrid = grids.last();
    await lastGrid.evaluate(grid => grid.scrollIntoView({block: 'end'}));
    expectInside(await boxOf(lastGrid), layerBox);
  });
});

test.describe('where the presets fit beside one month, 440 px', () => {
  test.use({
    isMobile: false,
    hasTouch: false,
    viewport: {width: 440, height: 800},
  });

  test('the presets stay beside the calendar', async ({page}) => {
    const {presets, layer, grids} = await openPicker(page);
    const presetBox = await boxOf(presets);
    const gridBox = await boxOf(grids.first());
    expect(presetBox.right).toBeLessThanOrEqual(gridBox.left + 0.5);
    expectInside(gridBox, await boxOf(layer));
    expect(await hasScrollableOverflow(layer)).toBe(false);
  });
});

test.describe('on a desktop page', () => {
  test.use({
    isMobile: false,
    hasTouch: false,
    viewport: {width: 1024, height: 768},
  });

  test('the presets stay beside the calendar', async ({page}) => {
    const {presets, layer, grids} = await openPicker(page);
    const presetBox = await boxOf(presets);
    const gridBox = await boxOf(grids.first());
    expect(presetBox.right).toBeLessThanOrEqual(gridBox.left + 0.5);
    expect(presetBox.top).toBeLessThan(gridBox.top);
    // The divider's clipped overhang is never scrollable overflow.
    expect(await hasScrollableOverflow(layer)).toBe(false);
  });
});
