// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^packages/core/src/AppShell/ ^apps/storybook/stories/AppShell

/**
 * @file AppShellSafeArea.a11y.chromium.spec.ts
 * @input The built AppShell stories on the phone profile. The Chromium
 *   protocol emulates the device's safe-area insets (iPhone 17 Pro, iOS 26.2).
 * @output Proves the safe-area geometry. The header background starts at the
 *   top edge, and its items start inside the insets. Main's block-end padding
 *   is `contentPadding` plus the bottom inset. With no insets, nothing moves.
 * @position Browser proof for AppShell.tsx, run by `pnpm test:a11y-contract`
 *   and in pr-a11y. Chromium only: WebKit under Playwright cannot emulate
 *   insets.
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

async function openStory(page: Page, id: string, globals = ''): Promise<void> {
  const query = globals === '' ? '' : `&globals=${globals}`;
  await page.goto(
    `${storybook.origin}/iframe.html?id=${id}&viewMode=story${query}`,
  );
  await page.locator('[role="banner"]').first().waitFor();
  await page.evaluate(async () => document.fonts.ready);
}

interface Insets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** iPhone 17 Pro, UIKit lab, iOS 26.2 simulator. */
const PORTRAIT: Insets = {top: 62, bottom: 34, left: 0, right: 0};
const LANDSCAPE: Insets = {top: 0, bottom: 21, left: 62, right: 62};
const NONE: Insets = {top: 0, bottom: 0, left: 0, right: 0};

// One protocol session per page, so each override replaces the one before it.
const sessions = new WeakMap<Page, CDPSession>();

async function emulateInsets(page: Page, insets: Insets): Promise<CDPSession> {
  let session = sessions.get(page);
  if (session == null) {
    session = await page.context().newCDPSession(page);
    sessions.set(page, session);
  }
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
  /** Main's block-start padding: its content padding alone. */
  contentPadding: number;
  /** The inset main publishes to its children, resolved to px. */
  published: number;
  boxSizing: string;
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
    const mainStyle = getComputedStyle(main);
    // What a bleed child subtracts: the published inset, resolved to px.
    const probe = document.createElement('div');
    probe.style.cssText =
      'position:absolute;visibility:hidden;width:var(--container-padding-block-end)';
    main.append(probe);
    const published = probe.getBoundingClientRect().width;
    probe.remove();
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
      spacer: parseFloat(mainStyle.paddingBottom) || 0,
      contentPadding: parseFloat(mainStyle.paddingTop) || 0,
      published,
      boxSizing: mainStyle.boxSizing,
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
    // Main's block-end padding is its content padding without insets, and
    // its content padding plus exactly the bottom inset with them.
    expect(g.contentPadding).toBeGreaterThan(0);
    expect(base).toBe(g.contentPadding);
    expect(g.spacer).toBe(g.contentPadding + PORTRAIT.bottom);
    // The inset main publishes to its children stays its content padding
    // alone, and main stays border-box.
    expect(g.published).toBe(g.contentPadding);
    expect(g.boxSizing).toBe('border-box');
  });
}

test('a child that fills main ends above the home indicator, without an outer scroll', async ({
  page,
}) => {
  await emulateInsets(page, PORTRAIT);
  await openStory(page, 'core-appshell--top-nav-only');
  const g = await page.evaluate(() => {
    // A child that fills main, as `Layout height="fill"` does.
    const main = document.querySelector('[role="main"]') as HTMLElement;
    const contentPadding = parseFloat(getComputedStyle(main).paddingTop) || 0;
    const child = document.createElement('div');
    child.style.height = '100%';
    main.replaceChildren(child);
    const box = main.getBoundingClientRect();
    return {
      contentPadding,
      overflow: main.scrollHeight - main.clientHeight,
      gap: box.bottom - child.getBoundingClientRect().bottom,
    };
  });
  test
    .info()
    .annotations.push({type: 'geometry', description: JSON.stringify(g)});
  expect(g.overflow).toBeLessThanOrEqual(0);
  expect(g.gap).toBeCloseTo(g.contentPadding + PORTRAIT.bottom, 0);
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
  expect(base).toBe(g.contentPadding);
  expect(g.spacer).toBe(g.contentPadding + LANDSCAPE.bottom);
});

test('in right to left the physical side insets stay on their sides', async ({
  page,
}) => {
  await page.setViewportSize({width: 874, height: 402});
  // A notch on the left only: the inset follows the device, not the text
  // direction, so it stays on the left in both directions.
  const uneven: Insets = {top: 0, bottom: 21, left: 62, right: 0};
  for (const direction of ['ltr', 'rtl']) {
    await emulateInsets(page, uneven);
    await openStory(
      page,
      'core-appshell--top-nav-only',
      `direction:${direction}`,
    );
    const g = await geometry(page);
    const applied = await page.evaluate(
      () =>
        getComputedStyle(document.querySelector('[role="banner"]') as Element)
          .direction,
    );
    test.info().annotations.push({
      type: `geometry ${direction}`,
      description: JSON.stringify(g),
    });
    expect(applied).toBe(direction);
    expect(g.padding.left).toBe(uneven.left);
    expect(g.padding.right).toBe(uneven.right);
    expect(g.item.left - g.shellLeft).toBeGreaterThanOrEqual(uneven.left - 0.5);
  }
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

/** The banner and the phone top bar below it, and the bar's menu button. */
async function stuckBar(page: Page) {
  return page.evaluate(() => {
    const banner = document.querySelector('[role="banner"]') as HTMLElement;
    const bar = [...document.querySelectorAll('.astryx-app-shell-header')].find(
      el => el !== banner,
    ) as HTMLElement;
    const button = bar.querySelector('button') as HTMLElement;
    const box = (el: HTMLElement) => el.getBoundingClientRect();
    return {
      scrollY: window.scrollY,
      bannerBottom: box(banner).bottom,
      barTop: box(bar).top,
      barHeight: box(bar).height,
      buttonTop: box(button).top,
      buttonHeight: box(button).height,
    };
  });
}

async function scrollPage(page: Page, y: number) {
  await page.evaluate(async top => {
    window.scrollTo(0, top);
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  }, y);
}

// In `auto`, the banner's wrapper and the phone top bar below it both stick.
// Scrolled, the bar must stick under the top inset, so its menu button stays
// clear of the status bar.
test('in auto, the phone top bar below a banner sticks under the top inset', async ({
  page,
}) => {
  await emulateInsets(page, PORTRAIT);
  await openStory(page, 'core-appshell--auto-height-side-nav-banner');
  const rest = await stuckBar(page);
  expect(rest.barHeight).toBeGreaterThan(0);
  expect(rest.buttonHeight).toBeGreaterThan(0);
  expect(rest.barTop).toBeGreaterThanOrEqual(rest.bannerBottom - 0.5);
  await scrollPage(page, 600);
  const scrolled = await stuckBar(page);
  test.info().annotations.push({
    type: 'geometry',
    description: JSON.stringify(scrolled),
  });
  expect(scrolled.scrollY).toBeGreaterThan(rest.bannerBottom);
  expect(scrolled.barTop).toBeCloseTo(PORTRAIT.top, 0);
  expect(scrolled.buttonTop).toBeGreaterThanOrEqual(PORTRAIT.top - 0.5);
  // With no insets, the bar sticks at the top edge.
  await emulateInsets(page, NONE);
  await openStory(page, 'core-appshell--auto-height-side-nav-banner');
  await scrollPage(page, 600);
  expect((await stuckBar(page)).barTop).toBeCloseTo(0, 0);
});

test('with no insets nothing moves', async ({page}) => {
  await emulateInsets(page, NONE);
  await openStory(page, 'core-appshell--top-nav-only');
  const g = await geometry(page);
  expect(g.padding).toEqual({top: 0, left: 0, right: 0});
  expect(g.item.top).toBeCloseTo(g.bannerTop, 1);
  // Main keeps its content padding on every side, and publishes it.
  expect(g.contentPadding).toBeGreaterThan(0);
  expect(g.spacer).toBe(g.contentPadding);
  expect(g.published).toBe(g.contentPadding);
});
