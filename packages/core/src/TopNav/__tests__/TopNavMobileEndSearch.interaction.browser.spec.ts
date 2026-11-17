// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TopNavMobileEndSearch.interaction.browser.spec.ts
 * @input The `Core/AppShell` Search In End Content On Mobile story in a built
 *   Storybook at 390, 375 and 320 px phone widths, in Chromium and WebKit
 * @output Real-browser evidence that end content wider than the phone bar
 *   stays inside it: a search field that may narrow narrows, each end control
 *   and the menu toggle keep their size and stay inside the bar, nothing
 *   overlaps, and the page does not scroll sideways
 * @position Run with `pnpm test:interaction`. jsdom has no layout, so the
 *   control boxes are only observable here.
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
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

const STORY = 'core-appshell--search-in-end-content-on-mobile';
const CONTROLS = [
  'Report a bug',
  'Notifications',
  'Profile',
  'Open navigation',
] as const;
// The widest phone comes first. Its sizes are the sizes to keep.
const WIDTHS = [390, 375, 320] as const;

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (box == null) {
    throw new Error('the element has no layout box');
  }
  return box;
}

async function openAt(page: Page, width: number) {
  await page.setViewportSize({width, height: 714});
  await page.goto(`${storybook.origin}/iframe.html?id=${STORY}&viewMode=story`);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  const bar = page.getByRole('navigation', {name: 'Main navigation'});
  await expect(bar).toBeVisible();
  return bar;
}

test('a search field in the end content narrows, so the end controls and the menu toggle stay inside the bar', async ({
  page,
}) => {
  const keptSizes = new Map<string, {width: number; height: number}>();
  let previousSearchWidth = Infinity;

  for (const width of WIDTHS) {
    const bar = await openAt(page, width);
    const barBox = await boxOf(bar);
    expect(barBox.x + barBox.width).toBeLessThanOrEqual(width);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);

    for (const name of CONTROLS) {
      const control = bar.getByRole('button', {name, exact: true});
      await expect(control).toBeVisible();
      const box = await boxOf(control);
      expect(box.x).toBeGreaterThanOrEqual(barBox.x);
      expect(box.x + box.width).toBeLessThanOrEqual(barBox.x + barBox.width);
      const kept = keptSizes.get(name) ?? {
        width: box.width,
        height: box.height,
      };
      keptSizes.set(name, kept);
      expect(box.width).toBeCloseTo(kept.width, 0);
      expect(box.height).toBeCloseTo(kept.height, 0);
    }

    // The field narrows as the phone narrows, and ends before the first
    // control, so nothing overlaps.
    const search = await boxOf(bar.getByRole('textbox', {name: 'Search'}));
    const firstControl = await boxOf(
      bar.getByRole('button', {name: CONTROLS[0], exact: true}),
    );
    expect(search.x).toBeGreaterThanOrEqual(barBox.x);
    expect(search.x + search.width).toBeLessThanOrEqual(firstControl.x);
    expect(search.width).toBeLessThanOrEqual(previousSearchWidth);
    previousSearchWidth = search.width;
  }
  // At 320 px the field is narrower than the 240px it asks for.
  expect(previousSearchWidth).toBeLessThan(240);
});
