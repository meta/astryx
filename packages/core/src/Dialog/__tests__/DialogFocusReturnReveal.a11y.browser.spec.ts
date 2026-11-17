// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y always

/**
 * @file DialogFocusReturnReveal.a11y.browser.spec.ts
 * @input The `Core/Dialog` default story in a built Storybook, placed far down
 *   a tall page.
 * @output Real-engine proof that closing a modal dialog returns focus to an
 *   opener the page scrolled off screen and brings that opener just into view
 *   (`nearest`), so a keyboard user sees where focus went.
 * @position Chromium and WebKit. Focus moves to the opener without a scroll,
 *   then the keyboard opens the dialog, so the dialog records the button
 *   itself as its opener. DialogCloseScroll covers the other opener a tap
 *   leaves in Safari, a `tabindex="-1"` region, which must not move the page.
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

const SPACER_HEIGHT = 3000;

/** Puts the story below a tall spacer, scrolls to the top, and focuses the
 * opener without a scroll, so the focused opener is off screen. */
async function mountOffScreen(page: Page) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-dialog--default&viewMode=story`,
  );
  const opener = page.getByRole('button', {name: 'Open Modal', exact: true});
  await expect(opener).toBeVisible();
  await page.evaluate(spacerHeight => {
    const root = document.getElementById('storybook-root');
    if (root?.parentNode == null) {
      throw new Error('no story root');
    }
    const spacer = document.createElement('div');
    spacer.style.height = `${spacerHeight}px`;
    root.parentNode.insertBefore(spacer, root);
    window.scrollTo(0, 0);
  }, SPACER_HEIGHT);
  await opener.evaluate(node =>
    (node as HTMLElement).focus({preventScroll: true}),
  );
  await expect(opener).toBeFocused();
  await expect.poll(async () => page.evaluate(() => window.scrollY)).toBe(0);
  expect(await isInViewport(page)).toBe(false);
  return opener;
}

async function isInViewport(page: Page): Promise<boolean> {
  return page
    .getByRole('button', {name: 'Open Modal', exact: true})
    .evaluate(node => {
      const rect = node.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= window.innerHeight;
    });
}

test('an Escape close brings an opener scrolled off screen into view', async ({
  page,
}) => {
  const opener = await mountOffScreen(page);
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await expect(opener).toBeFocused();
  await expect.poll(async () => isInViewport(page)).toBe(true);
  // Just into view (`nearest`): the opener came from below, so it stops at the
  // viewport's bottom edge, not at its centre or top.
  const gapBelow = await opener.evaluate(
    node => window.innerHeight - node.getBoundingClientRect().bottom,
  );
  expect(gapBelow).toBeGreaterThanOrEqual(0);
  expect(gapBelow).toBeLessThanOrEqual(2);
});
