// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope core/TopNav

/**
 * @file TopNavCrowdedHeading.a11y.chromium.spec.ts
 * @input The `Core/TopNav` FullExample, TitleOnly and IndependentHeadingLinks
 *   stories in a built Storybook, in real Chromium at narrow widths.
 * @output Real-engine proof that a crowded bar keeps the heading's logo whole
 *   and its box clear of every other control, that a heading wider than the
 *   whole bar truncates instead of scrolling the page sideways, and that
 *   independently linked lines keep their words visible instead of clipping
 *   to nothing (component:TopNavHeading FR1).
 * @position Run with `pnpm test:a11y-contract`.
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

async function openStory(page: Page, id: string): Promise<void> {
  await page.goto(`${storybook.origin}/iframe.html?id=${id}&viewMode=story`);
  await expect(page.locator('.astryx-top-nav-heading').first()).toBeVisible();
}

/**
 * The heading's box, its logo, the controls outside it that its box overlaps,
 * and whether the page scrolls sideways.
 */
async function measure(page: Page) {
  return page.evaluate(() => {
    const heading = document.querySelector<HTMLElement>(
      '.astryx-top-nav-heading',
    );
    const bar = heading?.closest('nav') ?? heading?.closest('header');
    if (heading == null || bar == null) {
      throw new Error('the story has no heading inside a bar');
    }
    const box = heading.getBoundingClientRect();
    const overlaps = [...bar.querySelectorAll<HTMLElement>('a, button')]
      .filter(control => !heading.contains(control))
      .filter(control => {
        const other = control.getBoundingClientRect();
        const width =
          Math.min(box.right, other.right) - Math.max(box.left, other.left);
        const height =
          Math.min(box.bottom, other.bottom) - Math.max(box.top, other.top);
        return width > 1 && height > 1;
      })
      .map(control => control.textContent?.trim() ?? '');
    const logo = heading.querySelector('svg, img');
    return {
      logoWidth: logo?.getBoundingClientRect().width ?? null,
      headingRight: box.right,
      overlaps,
      pageScrolls: document.documentElement.scrollWidth > innerWidth,
    };
  });
}

for (const width of [700, 600, 390]) {
  test(`at ${width} px a crowded bar keeps the heading's logo whole and its box clear of every other control`, async ({
    page,
  }) => {
    await page.setViewportSize({width, height: 320});
    await openStory(page, 'core-topnav--full-example');
    const box = await measure(page);
    expect(box.logoWidth).toBeGreaterThan(0);
    expect(box.overlaps).toEqual([]);
    expect(box.pageScrolls).toBe(false);
  });
}

test('a heading wider than the whole bar truncates instead of scrolling the page sideways', async ({
  page,
}) => {
  await page.setViewportSize({width: 320, height: 320});
  await openStory(page, 'core-topnav--title-only');
  const truncated = await page.evaluate(() => {
    const heading = document.querySelector<HTMLElement>(
      '.astryx-top-nav-heading',
    );
    const text = [...(heading?.querySelectorAll<HTMLElement>('*') ?? [])].find(
      el =>
        el.childNodes.length === 1 &&
        el.childNodes[0].nodeType === Node.TEXT_NODE &&
        el.textContent === 'Simple App',
    );
    if (text == null) {
      throw new Error('the story has no heading text');
    }
    text.textContent =
      'Northwind Traders International Holdings Operations Workspace';
    return text.scrollWidth > text.clientWidth;
  });
  const box = await measure(page);
  expect(truncated).toBe(true);
  expect(box.headingRight).toBeLessThanOrEqual(320);
  expect(box.overlaps).toEqual([]);
  expect(box.pageScrolls).toBe(false);
});

for (const width of [1280, 560, 480]) {
  test(`at ${width} px independently linked lines keep their words, and Tab lands on a visible link`, async ({
    page,
  }) => {
    await page.setViewportSize({width, height: 320});
    await openStory(page, 'core-topnav--independent-heading-links');
    const links = await page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLAnchorElement>(
          '.astryx-top-nav-heading a',
        ),
      ]
        .filter(link => (link.textContent ?? '').trim() !== '')
        .map(link => ({
          width: link.getBoundingClientRect().width,
          clipped:
            link.scrollWidth > link.clientWidth + 1 ||
            link.scrollHeight > link.clientHeight + 1,
        })),
    );
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link.width).toBeGreaterThan(0);
      expect(link.clipped).toBe(false);
    }
    const box = await measure(page);
    expect(box.overlaps).toEqual([]);
    expect(box.pageScrolls).toBe(false);

    // Tab from the top of the page until the superheading link holds focus.
    let focused = {text: '', width: 0, isFocusVisible: false};
    for (
      let step = 0;
      step < 6 && focused.text !== 'Northwind workspace';
      step++
    ) {
      await page.keyboard.press('Tab');
      focused = await page.evaluate(() => {
        const link = document.activeElement;
        return {
          text: link?.textContent?.trim() ?? '',
          width: link?.getBoundingClientRect().width ?? 0,
          isFocusVisible: link?.matches(':focus-visible') ?? false,
        };
      });
    }
    expect(focused.text).toBe('Northwind workspace');
    expect(focused.width).toBeGreaterThan(0);
    expect(focused.isFocusVisible).toBe(true);
  });
}
