// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TreeListGuideAlignment.interaction.browser.spec.ts
 * @input The built Fully Expanded TreeList story in a real browser
 * @output Proof that guides align to naturally placed chevrons without moving
 *   those controls between lineGuides and noGuides
 * @position Layout evidence for TreeList chevron and guide geometry
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

/**
 * The stretches no guide line paints in the bottom row's connector column,
 * from the top row's bottom edge to the bottom row's middle.
 */
async function guideGaps(page: Page, ids: {top: string; bottom: string}) {
  return page.evaluate(({top, bottom}) => {
    const row = (id: string) => {
      const item = document.querySelector(`[data-tree-id="${id}"]`);
      return item?.querySelector('.astryx-tree-list-item') ?? item;
    };
    const topRow = row(top)?.getBoundingClientRect();
    const bottomRow = row(bottom)?.getBoundingClientRect();
    // The column of the bottom row's own connector.
    const own = [
      ...(document
        .querySelector(`[data-tree-id="${bottom}"]`)
        ?.querySelectorAll('.astryx-tree-list-guide') ?? []),
    ]
      .map(line => line.getBoundingClientRect())
      .filter(box => box.height > 0)
      .sort((a, b) => b.left - a.left)[0];
    if (topRow == null || bottomRow == null || own == null) {
      throw new Error('rows or connector not found');
    }
    const x = own.left + own.width / 2;
    const spans = [
      ...document.querySelectorAll('[role="tree"] .astryx-tree-list-guide'),
    ]
      .map(line => line.getBoundingClientRect())
      .filter(
        box => box.height > 0 && Math.abs(box.left + box.width / 2 - x) < 1,
      )
      .map(box => [box.top, box.bottom] as const)
      .sort((a, b) => a[0] - b[0]);
    const from = topRow.bottom;
    const to = bottomRow.top + bottomRow.height / 2;
    const gaps: [number, number][] = [];
    let reached = from;
    for (const [start, end] of spans) {
      if (start > reached + 0.5 && start < to) {
        gaps.push([reached, Math.min(start, to)]);
      }
      reached = Math.max(reached, end);
    }
    if (reached < to - 0.5) {
      gaps.push([reached, to]);
    }
    return gaps;
  }, ids);
}

test("a parent's guide line runs unbroken past an expanded child's rows to its last child, at rest, with a mouse and under a finger", async ({
  page,
  browser,
}) => {
  // Project is the last row at its level, and src, its expanded child, is not
  // its last. So the line from src to package.json passes src's own rows.
  const open = async (target: Page) => {
    await target.goto(
      `${storybook.origin}/iframe.html?id=core-treelist--themed-guides&viewMode=story`,
    );
    await target.locator('[data-tree-id="pkg"]').waitFor();
  };
  await open(page);
  expect(await guideGaps(page, {top: 'src', bottom: 'pkg'})).toEqual([]);
  const context = await browser.newContext({hasTouch: true, isMobile: true});
  try {
    const touchPage = await context.newPage();
    await open(touchPage);
    expect(await guideGaps(touchPage, {top: 'src', bottom: 'pkg'})).toEqual([]);
  } finally {
    await context.close();
  }
});

test('at a wide row gap a last connector ends at its row, and a first one starts at its parent', async ({
  page,
}) => {
  await openStory(page, 'ltr', 'lineGuides');
  const issues = await page.evaluate(async () => {
    const tree = document.querySelector<HTMLElement>('.astryx-tree-list');
    tree?.style.setProperty('--tree-list-row-gap', '16px');
    await new Promise(requestAnimationFrame);
    const found: string[] = [];
    for (const item of document.querySelectorAll('[role="treeitem"]')) {
      if (Number(item.getAttribute('aria-level')) < 2) {
        continue;
      }
      const wrapper = item.firstElementChild;
      const row = wrapper?.querySelector('.astryx-tree-list-item');
      // The row's own connector is the guide in its innermost column.
      const own = [
        ...(wrapper?.firstElementChild?.querySelectorAll(
          '.astryx-tree-list-guide',
        ) ?? []),
      ]
        .map(line => line.getBoundingClientRect())
        .sort((a, b) => b.left - a.left)[0];
      if (wrapper == null || row == null || own == null) {
        found.push(`${item.getAttribute('data-tree-id')}: no connector`);
        continue;
      }
      const name = item.getAttribute('data-tree-id');
      const last =
        item.getAttribute('aria-posinset') ===
        item.getAttribute('aria-setsize');
      if (last && own.bottom > row.getBoundingClientRect().bottom + 0.5) {
        found.push(
          `${name}: ends ${own.bottom} past ${row.getBoundingClientRect().bottom}`,
        );
      }
      const top = wrapper.getBoundingClientRect().top;
      if (item.getAttribute('aria-posinset') === '1' && own.top > top + 0.5) {
        found.push(`${name}: starts ${own.top} below ${top}`);
      }
    }
    return found;
  });
  expect(issues).toEqual([]);
});
