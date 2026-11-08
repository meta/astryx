// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope core/TopNav

/**
 * @file TopNavCrowdedHeading.a11y.chromium.spec.ts
 * @input The `Core/TopNav` FullExample, TitleOnly and IndependentHeadingLinks
 *   stories in a built Storybook, in real Chromium at narrow widths.
 * @output Real-engine proof that a crowded start region truncates the
 *   heading's text first and keeps its logo whole and clear of the nav items,
 *   and that a long heading truncates inside its column instead of running
 *   under the end content, and that independently linked lines keep their
 *   words visible instead of clipping to nothing (component:TopNavHeading FR1).
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

/** Boxes of the heading's logo, its text, and the first nav item after it. */
async function measure(page: Page) {
  return page.evaluate(() => {
    const heading = document.querySelector<HTMLElement>(
      '.astryx-top-nav-heading',
    );
    const logo = heading?.querySelector('svg, img');
    const text = [...(heading?.querySelectorAll<HTMLElement>('*') ?? [])].find(
      el =>
        el.childNodes.length === 1 &&
        el.childNodes[0].nodeType === Node.TEXT_NODE &&
        (el.textContent ?? '').trim() !== '',
    );
    const firstItem = heading?.closest('nav')?.firstElementChild?.children[1];
    if (logo == null || text == null || firstItem == null) {
      throw new Error('the story has no logo, heading text, or nav item');
    }
    return {
      logoWidth: logo.getBoundingClientRect().width,
      logoRight: logo.getBoundingClientRect().right,
      textTruncated: text.scrollWidth > text.clientWidth,
      firstItemLeft: firstItem.getBoundingClientRect().left,
      pageScrolls: document.documentElement.scrollWidth > innerWidth,
    };
  });
}

for (const width of [700, 600]) {
  test(`at ${width} px the crowded start region truncates the heading text and keeps the logo`, async ({
    page,
  }) => {
    await page.setViewportSize({width, height: 240});
    await openStory(page, 'core-topnav--full-example');
    const box = await measure(page);
    expect(box.logoWidth).toBeGreaterThan(0);
    expect(box.logoRight).toBeLessThanOrEqual(box.firstItemLeft);
    expect(box.textTruncated).toBe(true);
    expect(box.pageScrolls).toBe(false);
  });
}

test('a long heading truncates inside its column instead of running under the end content', async ({
  page,
}) => {
  await page.setViewportSize({width: 420, height: 200});
  await openStory(page, 'core-topnav--title-only');
  const result = await page.evaluate(() => {
    const heading = document.querySelector<HTMLElement>(
      '.astryx-top-nav-heading',
    );
    const text = [...(heading?.querySelectorAll<HTMLElement>('*') ?? [])].find(
      el =>
        el.childNodes.length === 1 &&
        el.childNodes[0].nodeType === Node.TEXT_NODE &&
        el.textContent === 'Simple App',
    );
    const signIn = [...document.querySelectorAll('button')].find(button =>
      (button.textContent ?? '').includes('Sign in'),
    );
    if (heading == null || text == null || signIn == null) {
      throw new Error('the story has no heading text or Sign in button');
    }
    text.textContent = 'Northwind Traders International Holdings Workspace';
    return {
      headingRight: heading.getBoundingClientRect().right,
      endLeft: signIn.getBoundingClientRect().left,
      truncated: text.scrollWidth > text.clientWidth,
      pageScrolls: document.documentElement.scrollWidth > innerWidth,
    };
  });
  expect(result.headingRight).toBeLessThanOrEqual(result.endLeft);
  expect(result.truncated).toBe(true);
  expect(result.pageScrolls).toBe(false);
});

for (const width of [1280, 560, 480]) {
  test(`at ${width} px independently linked lines keep their words, and Tab lands on a visible link`, async ({
    page,
  }) => {
    await page.setViewportSize({width, height: 240});
    await openStory(page, 'core-topnav--independent-heading-links');
    const result = await page.evaluate(() => {
      const heading = document.querySelector<HTMLElement>(
        '.astryx-top-nav-heading',
      );
      const links = [
        ...(heading?.querySelectorAll<HTMLAnchorElement>('a') ?? []),
      ].filter(link => (link.textContent ?? '').trim() !== '');
      const firstItem = [...document.querySelectorAll('a')].find(
        link =>
          heading?.contains(link) !== true &&
          (link.textContent ?? '').includes('Dashboard'),
      );
      if (heading == null || links.length !== 2 || firstItem == null) {
        throw new Error('the story has no linked heading lines or nav item');
      }
      return {
        links: links.map(link => ({
          width: link.getBoundingClientRect().width,
          clipped:
            link.scrollWidth > link.clientWidth + 1 ||
            link.scrollHeight > link.clientHeight + 1,
        })),
        headingRight: Math.max(
          ...links.map(link => link.getBoundingClientRect().right),
        ),
        firstItemLeft: firstItem.getBoundingClientRect().left,
      };
    });
    for (const link of result.links) {
      expect(link.width).toBeGreaterThan(0);
      expect(link.clipped).toBe(false);
    }
    expect(result.headingRight).toBeLessThanOrEqual(result.firstItemLeft);

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
