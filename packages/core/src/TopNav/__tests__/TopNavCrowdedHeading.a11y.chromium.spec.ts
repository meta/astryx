// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope core/TopNav

/**
 * @file TopNavCrowdedHeading.a11y.chromium.spec.ts
 * @input The `Core/TopNav` FullExample and TitleOnly stories in a built
 *   Storybook, in real Chromium at narrow widths, with a long heading.
 * @output Real-engine proof that a crowded start region truncates the
 *   heading's text first and keeps its logo whole and clear of the nav items,
 *   and that a long heading truncates inside its column instead of running
 *   under the end content (component:TopNavHeading FR1).
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
  await expect(page.locator('.top-nav-heading').first()).toBeVisible();
}

/** Boxes of the heading's logo, its text, and the first nav item after it. */
function measure(page: Page) {
  return page.evaluate(() => {
    const heading = document.querySelector<HTMLElement>('.top-nav-heading')!;
    const logo = heading.querySelector('svg, img')!.getBoundingClientRect();
    const text = [...heading.querySelectorAll<HTMLElement>('*')].find(
      el =>
        el.childNodes.length === 1 &&
        el.childNodes[0].nodeType === Node.TEXT_NODE &&
        (el.textContent ?? '').trim() !== '',
    )!;
    const startRegion = heading.closest('nav')!.firstElementChild!;
    const firstItem = startRegion.children[1]?.getBoundingClientRect() ?? null;
    return {
      logoWidth: logo.width,
      logoRight: logo.right,
      textWidth: text.getBoundingClientRect().width,
      textTruncated: text.scrollWidth > text.clientWidth,
      firstItemLeft: firstItem?.left ?? null,
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
    expect(box.firstItemLeft).not.toBeNull();
    expect(box.logoRight).toBeLessThanOrEqual(box.firstItemLeft!);
    expect(box.textWidth).toBeLessThan(181);
  });
}

test('a long heading truncates inside its column instead of running under the end content', async ({
  page,
}) => {
  await page.setViewportSize({width: 420, height: 200});
  await openStory(page, 'core-topnav--title-only');
  const result = await page.evaluate(() => {
    const heading = document.querySelector<HTMLElement>('.top-nav-heading')!;
    const text = [...heading.querySelectorAll<HTMLElement>('*')].find(
      el =>
        el.childNodes.length === 1 &&
        el.childNodes[0].nodeType === Node.TEXT_NODE &&
        el.textContent === 'Simple App',
    )!;
    text.textContent = 'Northwind Traders International Holdings Workspace';
    const signIn = [...document.querySelectorAll('button')].find(button =>
      /Sign in/.test(button.textContent ?? ''),
    )!;
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
