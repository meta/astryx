// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/(Selector|Layer|Popover)/|apps/storybook/stories/Selector\.stories)

/**
 * @file SelectorBottomEdge.a11y.chromium.spec.ts
 * @input The Long List story at a 390x844 phone viewport, its trigger moved to
 *   the bottom of the screen
 * @output Browser proof that the selected-item overlay stays in the viewport
 *   when its clamp engages at the bottom edge: the whole layer, its
 *   viewport gutter counted, is on screen and the last option can be reached
 * @position Chromium contract for Selector FR2's viewport clamp
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
test.afterAll(async () => storybook?.close());

const VIEWPORT = {width: 390, height: 844};

for (const triggerTop of [742, 800]) {
  test(`the overlay stays on screen with its trigger at ${triggerTop} px`, async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORT);
    await page.goto(
      `${storybook.origin}/iframe.html?id=core-selector--long-list&viewMode=story`,
      {waitUntil: 'load'},
    );
    const trigger = page.getByRole('combobox').first();
    await expect(trigger).toBeVisible();
    await trigger.evaluate((element, top) => {
      const block = document.createElement('div');
      document.getElementById('storybook-root')?.prepend(block);
      // The story's layout moves the trigger by an uneven part of the
      // spacer's height, so bisect on the height until the trigger is placed.
      let low = 0;
      let high = 4000;
      for (let i = 0; i < 40; i++) {
        const height = (low + high) / 2;
        block.style.height = `${height}px`;
        const current = element.getBoundingClientRect().top;
        if (Math.abs(current - top) < 0.5) {
          break;
        }
        if (current < top) {
          low = height;
        } else {
          high = height;
        }
      }
    }, triggerTop);
    const placed = await trigger.evaluate(
      element => element.getBoundingClientRect().top,
    );
    expect(Math.abs(placed - triggerTop)).toBeLessThan(1);
    await trigger.click();
    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();
    const layer = await listbox.evaluate(list => {
      const box = (list.closest('[popover]') ?? list).getBoundingClientRect();
      return {top: box.top, bottom: box.bottom};
    });
    const detail = JSON.stringify(layer);
    expect(layer.top, detail).toBeGreaterThanOrEqual(-0.5);
    expect(layer.bottom, detail).toBeLessThanOrEqual(VIEWPORT.height + 0.5);
    // The last option scrolls into view inside the screen.
    const last = listbox.getByRole('option').last();
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
  });
}
