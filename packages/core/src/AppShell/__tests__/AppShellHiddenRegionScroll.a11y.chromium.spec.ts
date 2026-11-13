// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/AppShell|packages/core/src/TopNav|packages/core/src/SideNav|apps/storybook/stories/AppShell)

/**
 * @file AppShellHiddenRegionScroll.a11y.chromium.spec.ts
 * @input The `Core/AppShell` Focus Mode story in a built Storybook, in
 *   Chromium at a short desktop viewport so the side nav scrolls
 * @output Real-browser proof that a hidden region keeps its scroll position
 *   (component:AppShell FR19): a side nav scrolled down, hidden until it
 *   pauses, and shown again comes back at the same offset
 * @position Runs in pr-a11y when AppShell, its navs or their stories change.
 *   jsdom has no layout or scrolling, so only a browser shows the offset the
 *   pause would drop.
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

test.use({viewport: {width: 1280, height: 420}});

/** Marks the side nav's scrolling box with `data-scroll-probe`. */
async function markSideNavScroller(page: Page): Promise<void> {
  const found = await page
    .getByText('Dashboard')
    .first()
    .evaluate(item => {
      for (
        let at: HTMLElement | null = item as HTMLElement;
        at != null;
        at = at.parentElement
      ) {
        const overflowY = getComputedStyle(at).overflowY;
        if (
          (overflowY === 'auto' || overflowY === 'scroll') &&
          at.scrollHeight > at.clientHeight + 1
        ) {
          at.setAttribute('data-scroll-probe', '');
          return true;
        }
      }
      return false;
    });
  expect(found, 'a scrolling box around the side nav').toBe(true);
}

async function noRunningAnimations(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      !document
        .getAnimations()
        .some(animation => animation.playState === 'running'),
  );
}

test('a hidden side nav comes back at the scroll position it had', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-appshell--focus-mode&viewMode=story`,
  );
  await expect(page.getByText('Dashboard').first()).toBeVisible();
  await markSideNavScroller(page);
  const scroller = page.locator('[data-scroll-probe]');
  const scrolledTo = await scroller.evaluate(element => {
    element.scrollTop = 74;
    return element.scrollTop;
  });
  expect(scrolledTo).toBeGreaterThan(0);

  await page.getByRole('button', {name: 'Focus mode'}).click();
  // The side nav slides out, then pauses: its content stops being rendered.
  await expect.poll(async () => noRunningAnimations(page)).toBe(true);
  await expect(page.getByText('Dashboard').first()).toBeHidden();

  await page.getByRole('button', {name: 'Exit focus mode'}).click();
  await expect(page.getByText('Dashboard').first()).toBeVisible();
  await expect.poll(async () => noRunningAnimations(page)).toBe(true);
  expect(await scroller.evaluate(element => element.scrollTop)).toBe(
    scrolledTo,
  );
});
