// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file GridNarrowContainer.a11y.chromium.spec.ts
 * @input The `Core/Grid` Fill vs fit comparison story (`{minWidth: 250}`
 *   with and without `repeat: 'fit'`, no `max`) in a built Storybook.
 * @output Real-layout proof that a responsive Grid without `max` keeps its
 *   columns inside a container narrower than `minWidth`, and that a wide
 *   container still gets tracks at least `minWidth` wide (component:Grid FR2).
 * @position Run with `pnpm test:a11y-contract`. Track sizes need a real
 *   layout engine; jsdom has none.
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const STORY_ID = 'core-grid--fill-vs-fit-comparison';
const MIN_WIDTH = 250;

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

interface GridBox {
  width: number;
  scrollWidth: number;
  tracks: number[];
  itemRights: number[];
  right: number;
}

/** Each responsive Grid in the story: its box, its tracks and its items. */
async function grids(page: Page): Promise<GridBox[]> {
  return page.locator('.astryx-grid').evaluateAll(nodes =>
    nodes.map(node => {
      const box = node.getBoundingClientRect();
      return {
        width: box.width,
        scrollWidth: node.scrollWidth,
        tracks: getComputedStyle(node)
          .gridTemplateColumns.split(' ')
          .map(track => parseFloat(track)),
        itemRights: [...node.children].map(
          child => child.getBoundingClientRect().right,
        ),
        right: box.right,
      };
    }),
  );
}

async function open(page: Page, width: number) {
  await page.setViewportSize({width, height: 900});
  await page.goto(
    `${storybook.origin}/iframe.html?id=${STORY_ID}&viewMode=story`,
  );
  await page.locator('.astryx-grid').first().waitFor();
}

test.describe('Grid without max in a narrow container', () => {
  test('keeps one column inside a container narrower than minWidth', async ({
    page,
  }) => {
    await open(page, 200);
    const boxes = await grids(page);
    expect(boxes).toHaveLength(2);
    for (const grid of boxes) {
      expect(grid.width).toBeLessThan(MIN_WIDTH);
      expect(grid.tracks).toHaveLength(1);
      expect(grid.tracks[0]).toBeLessThanOrEqual(grid.width + 0.5);
      expect(grid.scrollWidth).toBeLessThanOrEqual(Math.ceil(grid.width));
      for (const right of grid.itemRights) {
        expect(right).toBeLessThanOrEqual(grid.right + 0.5);
      }
    }
    const pageWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(pageWidth).toBeLessThanOrEqual(200);
  });

  test('keeps tracks at least minWidth in a wide container', async ({page}) => {
    await open(page, 1280);
    const boxes = await grids(page);
    expect(boxes).toHaveLength(2);
    for (const grid of boxes) {
      expect(grid.tracks.length).toBeGreaterThan(1);
      for (const track of grid.tracks.filter(size => size > 0)) {
        expect(track).toBeGreaterThanOrEqual(MIN_WIDTH);
      }
    }
  });
});
