// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/Table/|apps/storybook/stories/Table\.stories)

/**
 * @file TableHeadingOverflow.a11y.chromium.spec.ts
 * @input Built HeadingOverflow Table story at a phone and a desktop width
 * @output Browser evidence that column headings follow the Table's textOverflow
 * @position Table integration proof; jsdom has no layout, so cut text is read here
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

interface HeadingLayout {
  text: string;
  whiteSpace: string;
  isCut: boolean;
  height: number;
  textHeight: number;
}

async function readHeadings(
  page: Page,
  mode: 'wrap' | 'sortable' | 'truncate',
): Promise<HeadingLayout[]> {
  return page
    .locator(`[data-heading-overflow="${mode}"] th`)
    .evaluateAll(cells =>
      cells.map(cell => {
        // A heading is cut when the cell or an element inside it clips more
        // than it shows. A sort control may grow into the cell's end padding,
        // so an element that does not clip is not cut.
        const isCut = [cell, ...Array.from(cell.querySelectorAll('*'))].some(
          node =>
            node.scrollWidth > node.clientWidth + 1 &&
            getComputedStyle(node).overflowX !== 'visible',
        );
        // Every cell in a row shares the row's height; the text's own box
        // shows how many lines the heading takes.
        const range = document.createRange();
        range.selectNodeContents(cell);
        return {
          text: cell.textContent ?? '',
          whiteSpace: getComputedStyle(cell).whiteSpace,
          isCut,
          height: cell.getBoundingClientRect().height,
          textHeight: range.getBoundingClientRect().height,
        };
      }),
    );
}

async function mount(page: Page, width: number) {
  await page.setViewportSize({width, height: 900});
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-table--heading-overflow&viewMode=story`,
  );
  await expect(page.locator('.astryx-table-scroll-wrapper')).toHaveCount(3);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

test('on a 390 px phone, a long heading wraps by default and truncates only in truncate mode', async ({
  page,
}) => {
  await mount(page, 390);

  const wrapped = await readHeadings(page, 'wrap');
  for (const heading of wrapped) {
    expect(heading.isCut, heading.text).toBe(false);
    expect(heading.whiteSpace, heading.text).not.toBe('nowrap');
  }
  const longest = wrapped.find(heading => heading.text === 'Apple Notes');
  const shortest = wrapped.find(heading => heading.text === 'Notion');
  expect(longest?.textHeight).toBeGreaterThan(
    (shortest?.textHeight ?? Infinity) * 1.5,
  );

  const sortable = await readHeadings(page, 'sortable');
  for (const heading of sortable) {
    expect(heading.isCut, heading.text).toBe(false);
  }
  // The sort indicator stays inside its cell when the label wraps.
  const indicatorInside = await page
    .locator('[data-heading-overflow="sortable"] th')
    .evaluateAll(cells =>
      cells
        .filter(cell => cell.querySelector('svg') != null)
        .map(cell => {
          const box = cell.getBoundingClientRect();
          const icon = (
            cell.querySelector('svg') as SVGElement
          ).getBoundingClientRect();
          return icon.left >= box.left - 1 && icon.right <= box.right + 1;
        }),
    );
  expect(indicatorInside.length).toBeGreaterThan(0);
  expect(indicatorInside).toEqual(indicatorInside.map(() => true));

  const truncated = await readHeadings(page, 'truncate');
  expect(truncated.find(h => h.text === 'Apple Notes')?.isCut).toBe(true);
  for (const heading of truncated) {
    expect(heading.whiteSpace, heading.text).toBe('nowrap');
  }
});

test('at 1280 px, fitting headings keep one line in both modes', async ({
  page,
}) => {
  await mount(page, 1280);

  const wrapped = await readHeadings(page, 'wrap');
  const truncated = await readHeadings(page, 'truncate');
  expect(wrapped.map(h => h.isCut)).toEqual(wrapped.map(() => false));
  expect(wrapped.map(h => h.height)).toEqual(truncated.map(h => h.height));
});
