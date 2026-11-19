// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TabWrappedLabel.interaction.browser.spec.ts
 * @input The built TabList "Wrapped label" story at phone widths
 * @output Real-browser evidence that a wrapped Tab label stays centered in
 *   its tab, selected or not, and that selection does not move it
 * @position Browser proof of component:Tab FR6 for a label that wraps
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

async function openStory(page: Page, story = 'wrapped-label'): Promise<void> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-tablist--${story}&viewMode=story`,
  );
  await page.locator('.astryx-tab').first().waitFor();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

interface LabelBox {
  readonly label: string;
  readonly lines: number;
  readonly sizerLines: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly cellCenterX: number;
  readonly cellCenterY: number;
  readonly tabWidth: number;
  readonly tabHeight: number;
}

/**
 * Each tab's visible label against the cell it shares with its semibold
 * sizer copy. The label box is the box of its text, not of its span.
 */
async function labelBoxes(page: Page): Promise<LabelBox[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.astryx-tab')].map(tab => {
      const sizer = [
        ...tab.querySelectorAll<HTMLElement>('span[aria-hidden="true"]'),
      ].find(
        span =>
          span.previousElementSibling?.textContent === span.textContent &&
          span.textContent !== '',
      );
      const text = sizer?.previousElementSibling as HTMLElement | undefined;
      const cell = sizer?.parentElement;
      if (sizer == null || text == null || cell == null) {
        throw new Error('A tab has no label cell');
      }
      const range = document.createRange();
      range.selectNodeContents(text);
      const textBox = range.getBoundingClientRect();
      const cellBox = cell.getBoundingClientRect();
      const tabBox = tab.getBoundingClientRect();
      const lineHeight = parseFloat(getComputedStyle(text).lineHeight);
      const sizerRange = document.createRange();
      sizerRange.selectNodeContents(sizer);
      const sizerBox = sizerRange.getBoundingClientRect();
      return {
        label: text.textContent ?? '',
        lines: Math.round(textBox.height / lineHeight),
        sizerLines: Math.round(sizerBox.height / lineHeight),
        // Measured from the tab's own box: selection can scroll the strip.
        centerX: textBox.left + textBox.width / 2 - tabBox.left,
        centerY: textBox.top + textBox.height / 2 - tabBox.top,
        cellCenterX: cellBox.left + cellBox.width / 2 - tabBox.left,
        cellCenterY: cellBox.top + cellBox.height / 2 - tabBox.top,
        tabWidth: tabBox.width,
        tabHeight: tabBox.height,
      };
    }),
  );
}

for (const width of [320, 390]) {
  test(`at ${width} px a wrapped label stays centered in its tab, selected or not`, async ({
    page,
  }) => {
    await page.setViewportSize({width, height: 700});
    await openStory(page);
    const before = await labelBoxes(page);
    // The case this guards: an unselected label that takes fewer lines than
    // its semibold copy.
    expect(before.some(box => box.lines < box.sizerLines)).toBe(true);
    for (const box of before) {
      expect(Math.abs(box.centerX - box.cellCenterX), box.label).toBeLessThan(
        1,
      );
      expect(Math.abs(box.centerY - box.cellCenterY), box.label).toBeLessThan(
        1,
      );
    }

    const wrapped = before.find(box => box.lines < box.sizerLines);
    if (wrapped == null) {
      throw new Error('No label wraps');
    }
    await page.locator('.astryx-tab', {hasText: wrapped.label}).click();
    const after = await labelBoxes(page);
    const selected = after.find(box => box.label === wrapped.label);
    if (selected == null) {
      throw new Error('The selected tab lost its label');
    }
    expect(Math.abs(selected.centerX - wrapped.centerX)).toBeLessThan(1);
    expect(Math.abs(selected.centerY - wrapped.centerY)).toBeLessThan(1);
    expect(selected.tabWidth).toBeCloseTo(wrapped.tabWidth, 0);
    expect(selected.tabHeight).toBeCloseTo(wrapped.tabHeight, 0);
  });
}

for (const story of ['link-tabs', 'default']) {
  test(`a one-line label in the ${story} story sits at its tab's center, selected or not`, async ({
    page,
  }) => {
    await page.setViewportSize({width: 1280, height: 700});
    await openStory(page, story);
    const boxes = await labelBoxes(page);
    expect(boxes.length).toBeGreaterThan(1);
    for (const box of boxes) {
      const tabCenterX = box.tabWidth / 2;
      const tabCenterY = box.tabHeight / 2;
      // Half a pixel: a tab of odd height cannot center a whole-pixel line.
      expect(Math.abs(box.centerX - tabCenterX), box.label).toBeLessThanOrEqual(
        0.5,
      );
      expect(Math.abs(box.centerY - tabCenterY), box.label).toBeLessThanOrEqual(
        0.5,
      );
    }
  });
}
