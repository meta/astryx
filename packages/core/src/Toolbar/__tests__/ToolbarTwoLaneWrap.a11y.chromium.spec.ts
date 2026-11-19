// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/Toolbar|apps/storybook/stories/Toolbar)

/**
 * @file ToolbarTwoLaneWrap.a11y.chromium.spec.ts
 * @input The built Toolbar "two lanes on a narrow screen" story in Chromium,
 *   at 390px and 1024px viewports
 * @output Real-browser proof that a two-lane row that does not fit wraps: the
 *   start lane keeps its title and count on one line and uncut, the end lane
 *   moves to a following line, and nothing leaves the screen; a wide row keeps
 *   one line (component:Toolbar FR2)
 * @position Runs in pr-a11y when Toolbar or its stories change. jsdom does
 *   no layout, so only a browser shows a wrapped or clipped lane.
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

async function readRow(page: Page, width: number) {
  await page.setViewportSize({width, height: 640});
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-toolbar--two-lane-narrow&viewMode=story`,
  );
  const toolbar = page.getByRole('toolbar', {name: 'Board actions'});
  await expect(toolbar).toBeVisible();
  return toolbar.evaluate(element => {
    const [start, end] = [...element.children] as HTMLElement[];
    const heading = start.querySelector('h1, h2, h3, h4, h5, h6');
    const headingBox = heading?.getBoundingClientRect();
    const lineHeight = heading
      ? parseFloat(getComputedStyle(heading).lineHeight)
      : 0;
    return {
      pageOverflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      startBottom: start.getBoundingClientRect().bottom,
      endTop: end.getBoundingClientRect().top,
      endRight: end.getBoundingClientRect().right,
      lastControlRight:
        end.lastElementChild?.getBoundingClientRect().right ?? 0,
      toolbarRight: element.getBoundingClientRect().right,
      headingLines: headingBox ? Math.round(headingBox.height / lineHeight) : 0,
      cut: [start, end].flatMap(lane =>
        [...lane.querySelectorAll<HTMLElement>('*')]
          .filter(part => part.scrollWidth > part.clientWidth + 1)
          .map(part => part.textContent?.trim() ?? ''),
      ),
    };
  });
}

test('a two-lane row that does not fit wraps at 390px', async ({page}) => {
  const row = await readRow(page, 390);
  expect(row.pageOverflow).toBeLessThanOrEqual(0);
  expect(row.headingLines).toBe(1);
  expect(row.cut).toEqual([]);
  expect(row.endTop).toBeGreaterThanOrEqual(row.startBottom);
  expect(row.endRight).toBeLessThanOrEqual(row.toolbarRight + 1);
  // The wrapped end lane keeps its controls at the inline end.
  expect(Math.abs(row.lastControlRight - row.toolbarRight)).toBeLessThan(1);
});

test('a two-lane row that fits keeps one line at 1024px', async ({page}) => {
  const row = await readRow(page, 1024);
  expect(row.headingLines).toBe(1);
  expect(row.endTop).toBeLessThan(row.startBottom);
  expect(Math.abs(row.lastControlRight - row.toolbarRight)).toBeLessThan(1);
});
