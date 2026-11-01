// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file SpacingRootFontSize.a11y.chromium.spec.ts
 * @input The checked-in Stack and TableRowExpansion stories, and Chromium
 * @output Browser evidence that spacing follows the root font size as text does
 * @position Theme token proof (WCAG 2.2 SC 1.4.4 Resize Text). A reader who
 *   raises the browser's font size gets larger text from the rem type scale;
 *   the gaps and padding between that text have to grow with it, and stay
 *   exactly as they were at the default 16px root.
 */

import {expect, test, type Page} from '@playwright/test';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

/** Each spacing token and the step it multiplies by the 4px base unit. */
const SPACING_STEPS: Readonly<Record<string, number>> = {
  '--spacing-0': 0,
  '--spacing-0-5': 0.5,
  '--spacing-1': 1,
  '--spacing-1-5': 1.5,
  '--spacing-2': 2,
  '--spacing-3': 3,
  '--spacing-4': 4,
  '--spacing-5': 5,
  '--spacing-6': 6,
  '--spacing-7': 7,
  '--spacing-8': 8,
  '--spacing-9': 9,
  '--spacing-10': 10,
  '--spacing-11': 11,
  '--spacing-12': 12,
};

let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});

test.afterAll(async () => {
  await storybook?.close();
});

async function openStory(
  page: Page,
  id: string,
  rootFontSizePx: number,
  globals = '',
) {
  const query = globals === '' ? '' : `&globals=${globals}`;
  await page.goto(
    `${storybook.origin}/iframe.html?id=${id}&viewMode=story${query}`,
    {waitUntil: 'load'},
  );
  await page.locator('#storybook-root > *').first().waitFor();
  // The browser's font-size setting changes the root font size; setting it
  // on the root element is the same input, without restarting the browser.
  await page.evaluate(size => {
    document.documentElement.style.fontSize = `${size}px`;
  }, rootFontSizePx);
}

/** Every spacing token's used length in px, read off a probe's width. */
async function spacingLengths(page: Page): Promise<Record<string, number>> {
  return page.evaluate(names => {
    const probe = document.createElement('div');
    probe.style.position = 'absolute';
    document.body.append(probe);
    const lengths: Record<string, number> = {};
    for (const name of names) {
      probe.style.width = `var(${name})`;
      lengths[name] = Number.parseFloat(getComputedStyle(probe).width);
    }
    probe.remove();
    return lengths;
  }, Object.keys(SPACING_STEPS));
}

/** The left edge of the first text node that reads exactly `text`. */
async function textLeft(page: Page, text: string): Promise<number> {
  return page.evaluate(wanted => {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.textContent?.trim() === wanted) {
        const range = document.createRange();
        range.selectNodeContents(node);
        return range.getBoundingClientRect().left;
      }
    }
    throw new Error(`no text node reads "${wanted}"`);
  }, text);
}

for (const rootFontSizePx of [16, 20]) {
  const scale = rootFontSizePx / 16;

  test(`every spacing step is ${4 * scale}px × step at a ${rootFontSizePx}px root`, async ({
    page,
  }) => {
    await openStory(page, 'core-stack--vertical', rootFontSizePx);
    const lengths = await spacingLengths(page);
    for (const [name, step] of Object.entries(SPACING_STEPS)) {
      expect(lengths[name], name).toBeCloseTo(4 * scale * step, 3);
    }
  });

  test(`a stack's gap grows with its text at a ${rootFontSizePx}px root`, async ({
    page,
  }) => {
    await openStory(page, 'core-stack--vertical', rootFontSizePx);
    const stack = page.getByText('Item 1', {exact: true}).locator('..');
    const gap = await stack.evaluate(
      element => getComputedStyle(element).rowGap,
    );
    // gap={4} is --spacing-4: 16px at the default root, 20px at 20px.
    expect(gap).toBe(`${16 * scale}px`);
  });
}

test('a detail panel keeps its place beside the first column at any root size', async ({
  page,
}) => {
  // The chevron column is a fixed pixel width, so the panel's indent spells
  // those pixels while its padding half follows the spacing scale, as the
  // cell's own padding does. A larger root font size must not slide the
  // panel's content away from the first column's.
  const offsets: number[] = [];
  // 32px is text at 200%, where the column's own insets would outgrow it.
  for (const rootFontSizePx of [16, 20, 32]) {
    await openStory(
      page,
      'core-tablerowexpansion--detail-panel',
      rootFontSizePx,
    );
    await expect(page.getByText('Line items')).toBeVisible();
    offsets.push(
      (await textLeft(page, 'Line items')) -
        (await textLeft(page, 'Ada Lovelace')),
    );
  }
  expect(Math.abs(offsets[0])).toBeLessThanOrEqual(1);
  for (const offset of offsets) {
    expect(Math.abs(offset - offsets[0])).toBeLessThan(0.5);
  }
});

test('the expansion chevron sits inside its column at any root size or spacing scale', async ({
  page,
}) => {
  // The chevron column is a fixed pixel width while the cell's insets follow
  // the spacing scale, so the chevron centers itself in the column instead of
  // laying out after those insets and running past the column's edge.
  for (const [rootFontSizePx, globals] of [
    [16, ''],
    [20, ''],
    [32, ''],
    [16, 'astryxTheme:matcha'],
  ] as const) {
    await openStory(
      page,
      'core-tablerowexpansion--detail-panel',
      rootFontSizePx,
      globals,
    );
    const chevron = page.locator('button[aria-expanded="true"]').first();
    await expect(chevron).toBeVisible();
    const {glyph, cell} = await chevron.evaluate(button => {
      const box = (element: Element) => {
        const rect = element.getBoundingClientRect();
        return {left: rect.left, right: rect.right};
      };
      const svg = button.querySelector('svg');
      const td = button.closest('td');
      if (svg == null || td == null) {
        throw new Error('missing chevron glyph or cell');
      }
      return {glyph: box(svg), cell: box(td)};
    });
    const where = `${rootFontSizePx}px root ${globals}`;
    expect(cell.right - cell.left, where).toBeCloseTo(40, 0);
    expect(glyph.left, where).toBeGreaterThanOrEqual(cell.left);
    expect(glyph.right, where).toBeLessThanOrEqual(cell.right);
    expect(
      Math.abs((glyph.left + glyph.right) / 2 - (cell.left + cell.right) / 2),
      where,
    ).toBeLessThan(1);
  }
});
