// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TreeListGuideAlignment.interaction.browser.spec.ts
 * @input The built Fully Expanded TreeList story in a real browser
 * @output Proof that guides align to naturally placed chevrons without moving
 *   those controls between lineGuides and noGuides
 * @position Layout evidence for TreeList chevron and guide geometry
 */

import {expect, test, type Page} from '@playwright/test';
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

type Direction = 'ltr' | 'rtl';
type Variant = 'lineGuides' | 'noGuides';

interface Geometry {
  chevronCenters: number[];
  guideCenters: number[];
  chevronStartOffsets: number[];
}

async function openStory(
  page: Page,
  direction: Direction,
  variant: Variant,
): Promise<void> {
  const params = new URLSearchParams({
    id: 'core-treelist--fully-expanded',
    viewMode: 'story',
    args: `variant:${variant}`,
  });
  await page.goto(`${storybook.origin}/iframe.html?${params}`);
  await page.locator('.astryx-tree-list').waitFor();
  await page.evaluate(dir => {
    const tree = document.querySelector('.astryx-tree-list');
    if (tree == null) {
      throw new Error('TreeList root not found');
    }
    tree.setAttribute('dir', dir);
  }, direction);
  await page.evaluate(
    async () =>
      new Promise<void>(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

async function measureGeometry(page: Page): Promise<Geometry> {
  return page.evaluate(() => {
    const chevrons = Array.from(
      document.querySelectorAll<HTMLElement>('.astryx-tree-list-chevron'),
    );
    const guides = Array.from(
      document.querySelectorAll<HTMLElement>('.astryx-tree-list-guide'),
    );
    const centerOf = (element: HTMLElement): number => {
      const rect = element.getBoundingClientRect();
      return rect.left + rect.width / 2;
    };
    const unique = (values: number[]): number[] =>
      Array.from(new Set(values.map(value => Math.round(value * 2) / 2))).sort(
        (a, b) => a - b,
      );

    return {
      chevronCenters: unique(chevrons.map(centerOf)),
      guideCenters: unique(guides.map(centerOf)),
      chevronStartOffsets: chevrons.map(chevron => {
        const content = chevron.parentElement;
        if (content == null) {
          throw new Error('Chevron has no content container');
        }
        const chevronRect = chevron.getBoundingClientRect();
        const contentStyle = getComputedStyle(content);
        const contentRect = content.getBoundingClientRect();
        const paddingStart = Number.parseFloat(contentStyle.paddingInlineStart);
        return contentStyle.direction === 'rtl'
          ? contentRect.right - paddingStart - chevronRect.right
          : chevronRect.left - contentRect.left - paddingStart;
      }),
    };
  });
}

for (const direction of ['ltr', 'rtl'] as const) {
  test(`guides align to unshifted chevrons in ${direction.toUpperCase()}`, async ({
    page,
  }) => {
    await openStory(page, direction, 'lineGuides');
    const geometry = await measureGeometry(page);

    expect(geometry.chevronStartOffsets.length).toBeGreaterThan(0);
    for (const offset of geometry.chevronStartOffsets) {
      expect(offset).toBeCloseTo(0, 1);
    }
    expect(geometry.guideCenters).toEqual(geometry.chevronCenters);
  });
}

test('guide visibility does not move chevrons', async ({page}) => {
  await openStory(page, 'ltr', 'lineGuides');
  const withGuides = await measureGeometry(page);

  await openStory(page, 'ltr', 'noGuides');
  const withoutGuides = await measureGeometry(page);

  expect(withGuides.chevronCenters).toEqual(withoutGuides.chevronCenters);
  expect(withoutGuides.guideCenters).toEqual([]);
});
