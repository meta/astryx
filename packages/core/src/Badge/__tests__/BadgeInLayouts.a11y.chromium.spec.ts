// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file BadgeInLayouts.a11y.chromium.spec.ts
 * @input The `Core/Badge` In layouts story in a built Storybook, in Chromium.
 * @output Real-layout proof that a badge is as wide as its label in a Grid
 *   cell and in a VStack, which stretch a child whose width is `auto`, and
 *   that in a crowded HStack it still shrinks, cuts its label with an
 *   ellipsis and stays inside the row (component:Badge FR3).
 * @position Run with `pnpm test:a11y-contract`. Box sizes need a real layout
 *   engine; jsdom has none.
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

interface BadgeBox {
  label: string;
  /** The label is cut with an ellipsis: wider than the room it has. */
  truncated: boolean;
  width: number;
  /** Its width when its own width is `auto`: what the layout stretches it to. */
  autoWidth: number;
  left: number;
  right: number;
  containerLeft: number;
  containerRight: number;
}

/** Each badge in the container, measured as it is and with `width: auto`. */
async function badgesIn(page: Page, testId: string): Promise<BadgeBox[]> {
  return page.getByTestId(testId).evaluate(container =>
    [...container.querySelectorAll<HTMLElement>('.astryx-badge')].map(badge => {
      const box = badge.getBoundingClientRect();
      const label = badge.lastElementChild as HTMLElement;
      const truncated = label.scrollWidth > label.clientWidth;
      badge.style.width = 'auto';
      const autoWidth = badge.getBoundingClientRect().width;
      badge.style.width = '';
      const outer = container.getBoundingClientRect();
      return {
        label: label.textContent ?? '',
        truncated,
        width: box.width,
        autoWidth,
        left: box.left,
        right: box.right,
        containerLeft: outer.left,
        containerRight: outer.right,
      };
    }),
  );
}

test.describe('Badge in layouts', () => {
  test.beforeEach(async ({page}) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=core-badge--in-layouts&viewMode=story`,
    );
    await page.getByTestId('badge-in-hstack').waitFor();
  });

  test('keeps its label width in a Grid cell', async ({page}) => {
    const badges = await badgesIn(page, 'badge-in-grid');
    expect(badges).toHaveLength(2);
    for (const badge of badges) {
      expect(badge.truncated, badge.label).toBe(false);
      // A stretched badge would be as wide as its cell, about half the grid.
      expect(badge.autoWidth - badge.width, badge.label).toBeGreaterThan(40);
    }
  });

  test('keeps its label width in a VStack', async ({page}) => {
    const [badge] = await badgesIn(page, 'badge-in-vstack');
    expect(badge.truncated).toBe(false);
    expect(badge.autoWidth).toBeCloseTo(
      badge.containerRight - badge.containerLeft,
      0,
    );
    expect(badge.width).toBeLessThan(badge.autoWidth / 2);
  });

  test('shrinks with an ellipsis inside a crowded HStack', async ({page}) => {
    const [badge] = await badgesIn(page, 'badge-in-hstack');
    expect(badge.truncated).toBe(true);
    expect(badge.width).toBeGreaterThan(0);
    expect(badge.right).toBeLessThanOrEqual(badge.containerRight + 0.5);
  });
});
