// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TopNavMobileLongHeading.interaction.browser.spec.ts
 * @input The `Core/AppShell` Long Heading On Mobile and Long Text Heading On
 *   Mobile stories in a built Storybook at 390, 375 and 320 px phone widths,
 *   in Chromium and WebKit
 * @output Real-browser evidence that a long heading, as TopNavHeading or as
 *   plain text, truncates to one line with an ellipsis, that the logo, each end
 *   control and the menu toggle keep their size and stay inside the bar, and
 *   that the bar keeps one row and the page does not scroll sideways
 * @position Run with `pnpm test:interaction`. jsdom has no layout, so the
 *   truncation and the control boxes are only observable here.
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

const STORIES = [
  {story: 'core-appshell--long-heading-on-mobile', hasLogo: true},
  {story: 'core-appshell--long-text-heading-on-mobile', hasLogo: false},
] as const;
const HEADING = 'Northwind Internal Usage Analytics';
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

async function openAt(page: Page, story: string, width: number) {
  await page.setViewportSize({width, height: 714});
  await page.goto(`${storybook.origin}/iframe.html?id=${story}&viewMode=story`);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  const bar = page.getByRole('navigation', {name: 'Main navigation'});
  await expect(bar).toBeVisible();
  return bar;
}

for (const {story, hasLogo} of STORIES) {
  test(`a long heading truncates to one line, and the end controls keep their size inside the bar: ${story}`, async ({
    page,
  }) => {
    const keptSizes = new Map<string, {width: number; height: number}>();
    let keptBarHeight: number | undefined;

    for (const width of WIDTHS) {
      const bar = await openAt(page, story, width);
      const barBox = await boxOf(bar);
      expect(barBox.x).toBeGreaterThanOrEqual(0);
      expect(barBox.x + barBox.width).toBeLessThanOrEqual(width);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);

      // The heading text stays on one line and ends in an ellipsis.
      const text = bar.getByText(HEADING, {exact: true});
      const textState = await text.evaluate(element => {
        const style = getComputedStyle(element);
        return {
          textOverflow: style.textOverflow,
          whiteSpace: style.whiteSpace,
          lineHeight: parseFloat(style.lineHeight),
          height: element.getBoundingClientRect().height,
          truncated: element.scrollWidth > element.clientWidth,
        };
      });
      expect(textState.textOverflow).toBe('ellipsis');
      expect(textState.whiteSpace).toBe('nowrap');
      expect(textState.truncated).toBe(true);
      expect(textState.height).toBeLessThanOrEqual(textState.lineHeight * 1.5);

      // The logo and each control are fully inside the bar, at the size they
      // have on the widest phone.
      const parts: [string, Locator][] = CONTROLS.map(name => [
        name,
        bar.getByRole('button', {name, exact: true}),
      ]);
      if (hasLogo) {
        parts.push(['logo', bar.locator('.astryx-nav-icon').first()]);
      }
      for (const [name, part] of parts) {
        await expect(part).toBeVisible();
        const box = await boxOf(part);
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

      // The truncated text ends before the first control, so nothing
      // overlaps.
      const textBox = await boxOf(text);
      const firstControl = await boxOf(
        bar.getByRole('button', {name: CONTROLS[0], exact: true}),
      );
      expect(textBox.x + textBox.width).toBeLessThanOrEqual(firstControl.x);

      // The bar keeps one row: its height does not change with the width.
      keptBarHeight ??= barBox.height;
      expect(barBox.height).toBeCloseTo(keptBarHeight, 0);
    }
  });
}
