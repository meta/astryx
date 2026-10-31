// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^packages/core/src/AppShell/ ^apps/storybook/stories/AppShell

/**
 * @file AppShellSafeArea.a11y.chromium.spec.ts
 * @input The built AppShell stories ("Top nav only", "Auto height", "Side nav
 *   only") on the phone profile, with the device's safe-area insets emulated
 *   through the Chromium protocol (iPhone 17 Pro, iOS 26.2: 62 / 34 in
 *   portrait; 62 on each side and 21 at the bottom in landscape)
 * @output Browser proof that AppShell keeps to the safe area: the header's
 *   background starts at the shell's top edge while its items start below the
 *   top inset and inside the side insets, the main region's content ends a
 *   bottom inset above the end of its scroller (or of the page), and with no
 *   insets nothing moves
 * @position Browser proof for AppShell.tsx's safe-area styles, run by
 *   `pnpm test:a11y-contract` and in pr-a11y. Chromium only: WebKit under
 *   Playwright cannot emulate insets; iOS Safari is the simulator run. The
 *   items must stay where a finger and the eye can reach them (WCAG 2.5.8
 *   target reach, 1.4.10 reflow at the screen's edges).
 */

import {expect, test, type CDPSession, type Page} from '@playwright/test';
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

// The phone: an iPhone 17 Pro page in Safari, portrait.
test.use({
  viewport: {width: 402, height: 714},
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});

async function openStory(page: Page, id: string): Promise<void> {
  await page.goto(`${storybook.origin}/iframe.html?id=${id}&viewMode=story`);
  await page.locator('[role="banner"]').first().waitFor();
  await page.evaluate(async () => document.fonts.ready);
}

interface Insets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** iPhone 17 Pro, iOS 26.2, from the UIKit reference capture. */
const PORTRAIT: Insets = {top: 62, bottom: 34, left: 0, right: 0};
const LANDSCAPE: Insets = {top: 0, bottom: 21, left: 62, right: 62};
const NONE: Insets = {top: 0, bottom: 0, left: 0, right: 0};

async function emulateInsets(page: Page, insets: Insets): Promise<CDPSession> {
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setSafeAreaInsetsOverride', {
    insets: {
      top: insets.top,
      topMax: insets.top,
      bottom: insets.bottom,
      bottomMax: insets.bottom,
      left: insets.left,
      leftMax: insets.left,
      right: insets.right,
      rightMax: insets.right,
    },
  });
  return session;
}

/** Main's block-end padding with no insets: the content padding alone. */
async function endPaddingWithoutInsets(
  page: Page,
  story: string,
): Promise<number> {
  await emulateInsets(page, NONE);
  await openStory(page, story);
  return page.evaluate(
    () =>
      parseFloat(
        getComputedStyle(document.querySelector('[role="main"]') as HTMLElement)
          .paddingBottom,
      ) || 0,
  );
}

interface Geometry {
  shellTop: number;
  shellLeft: number;
  shellRight: number;
  bannerTop: number;
  padding: {top: number; left: number; right: number};
  /** The banner's first item (TopNav's or the top bar's content). */
  item: {top: number; left: number; right: number};
  /** Main's block-end padding: its content padding plus the bottom inset. */
  spacer: number;
}

async function geometry(page: Page): Promise<Geometry> {
  return page.evaluate(() => {
    const shell = document.querySelector('[role="banner"]')?.parentElement;
    const root = document.querySelector('.astryx-app-shell');
    const banner = document.querySelector('[role="banner"]') as HTMLElement;
    const main = document.querySelector('[role="main"]') as HTMLElement;
    const style = getComputedStyle(banner);
    // The banner's content box: what its items lay out in.
    const first = banner.firstElementChild as HTMLElement;
    const items = first.getBoundingClientRect();
    const box = (root ?? shell ?? banner).getBoundingClientRect();
    return {
      shellTop: box.top,
      shellLeft: box.left,
      shellRight: box.right,
      bannerTop: banner.getBoundingClientRect().top,
      padding: {
        top: parseFloat(style.paddingTop),
        left: parseFloat(style.paddingLeft),
        right: parseFloat(style.paddingRight),
      },
      item: {top: items.top, left: items.left, right: items.right},
      spacer: parseFloat(getComputedStyle(main).paddingBottom) || 0,
    };
  });
}

for (const story of [
  'core-appshell--top-nav-only',
  'core-appshell--auto-height',
]) {
  test(`${story}: in portrait the header reaches under the status bar and the content clears the home indicator`, async ({
    page,
  }) => {
    const base = await endPaddingWithoutInsets(page, story);
    await emulateInsets(page, PORTRAIT);
    await openStory(page, story);
    const g = await geometry(page);
    test
      .info()
      .annotations.push({type: 'geometry', description: JSON.stringify(g)});
    // The background starts at the shell's top edge…
    expect(g.bannerTop).toBeCloseTo(g.shellTop, 1);
    // …and the items start below the inset.
    expect(g.padding.top).toBe(PORTRAIT.top);
    expect(g.item.top - g.bannerTop).toBeGreaterThanOrEqual(PORTRAIT.top - 0.5);
    // Main's end padding grows by exactly the bottom inset.
    expect(g.spacer - base).toBe(PORTRAIT.bottom);
  });
}

test('a child that fills main ends above the home indicator, without an outer scroll', async ({
  page,
}) => {
  await emulateInsets(page, PORTRAIT);
  await openStory(page, 'core-appshell--top-nav-only');
  const g = await page.evaluate(() => {
    // A child that fills main, as `Layout height="fill"` does under
    // `contentPadding={0}`.
    const main = document.querySelector('[role="main"]') as HTMLElement;
    const child = document.createElement('div');
    child.style.height = '100%';
    main.replaceChildren(child);
    const box = main.getBoundingClientRect();
    return {
      overflow: main.scrollHeight - main.clientHeight,
      gap: box.bottom - child.getBoundingClientRect().bottom,
    };
  });
  test
    .info()
    .annotations.push({type: 'geometry', description: JSON.stringify(g)});
  expect(g.overflow).toBeLessThanOrEqual(0);
  expect(g.gap).toBeCloseTo(PORTRAIT.bottom, 0);
});

test('in landscape the header items stay inside the side insets', async ({
  page,
}) => {
  await page.setViewportSize({width: 874, height: 402});
  const base = await endPaddingWithoutInsets(
    page,
    'core-appshell--top-nav-only',
  );
  await emulateInsets(page, LANDSCAPE);
  await openStory(page, 'core-appshell--top-nav-only');
  const g = await geometry(page);
  test
    .info()
    .annotations.push({type: 'geometry', description: JSON.stringify(g)});
  expect(g.padding.left).toBe(LANDSCAPE.left);
  expect(g.padding.right).toBe(LANDSCAPE.right);
  expect(g.item.left - g.shellLeft).toBeGreaterThanOrEqual(
    LANDSCAPE.left - 0.5,
  );
  expect(g.shellRight - g.item.right).toBeGreaterThanOrEqual(
    LANDSCAPE.right - 0.5,
  );
  expect(g.padding.top).toBe(0);
  expect(g.spacer - base).toBe(LANDSCAPE.bottom);
});

test('the sidenav-only phone top bar keeps to the safe area too', async ({
  page,
}) => {
  await emulateInsets(page, PORTRAIT);
  await openStory(page, 'core-appshell--side-nav-only');
  const g = await geometry(page);
  test
    .info()
    .annotations.push({type: 'geometry', description: JSON.stringify(g)});
  expect(g.padding.top).toBe(PORTRAIT.top);
  expect(g.item.top - g.bannerTop).toBeGreaterThanOrEqual(PORTRAIT.top - 0.5);
});

test('with no insets nothing moves', async ({page}) => {
  await emulateInsets(page, NONE);
  await openStory(page, 'core-appshell--top-nav-only');
  const g = await geometry(page);
  expect(g.padding).toEqual({top: 0, left: 0, right: 0});
  expect(g.item.top).toBeCloseTo(g.bannerTop, 1);
});
