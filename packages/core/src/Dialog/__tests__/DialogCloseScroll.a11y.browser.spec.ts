// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y always

/**
 * @file DialogCloseScroll.a11y.browser.spec.ts
 * @input The `Core/Dialog` default story in a built Storybook, placed in a
 *   tall focusable main region of a scrolled page, as an app places a
 *   dialog's trigger.
 * @output Real-engine proof that closing a modal dialog keeps the page where
 *   it was: the scroll offset and the trigger's place on screen are the same
 *   after a pointer close (Cancel, the backdrop) and after Escape. A Tab-stop
 *   opener the page scrolled off screen comes back just into view (`nearest`).
 * @position Chromium and WebKit. The page focuses the region before a
 *   programmatic click opens the dialog, as a tap leaves focus in Safari, where
 *   a button is not mouse-focusable; the dialog then records the region as its
 *   opener, and a focus return that reveals the region scrolls the page to its
 *   top edge.
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

const HEADER_HEIGHT = 192;
const SCROLL_OFFSET = 129;

/**
 * Mounts the story in a tall page: a header, then a focusable main region
 * that holds the trigger and a long tail. Scrolls so that the region's top
 * edge sits below the viewport's top edge, the geometry in which a reveal of
 * the region moves the page.
 */
async function mountScrolled(page: Page, regionTabIndex = -1) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-dialog--default&viewMode=story`,
  );
  const opener = page.getByRole('button', {name: 'Open Modal', exact: true});
  await expect(opener).toBeVisible();
  await page.evaluate(
    ({headerHeight, scrollOffset, tabIndex}) => {
      const root = document.getElementById('storybook-root');
      if (root?.parentNode == null) {
        throw new Error('no story root');
      }
      const spacer = (height: number) => {
        const node = document.createElement('div');
        node.style.height = `${height}px`;
        return node;
      };
      const main = document.createElement('div');
      main.tabIndex = tabIndex;
      root.parentNode.insertBefore(spacer(headerHeight), root);
      root.parentNode.insertBefore(main, root);
      main.append(spacer(400), root, spacer(3000));
      window.scrollTo(0, scrollOffset);
      // Where Safari puts focus on a tap inside the region: a button is not
      // mouse-focusable there, so its nearest focusable ancestor takes it.
      main.focus({preventScroll: true});
    },
    {
      headerHeight: HEADER_HEIGHT,
      scrollOffset: SCROLL_OFFSET,
      tabIndex: regionTabIndex,
    },
  );
  await expect
    .poll(async () => page.evaluate(() => window.scrollY))
    .toBe(SCROLL_OFFSET);
  const openerTop = await opener.evaluate(
    node => node.getBoundingClientRect().top,
  );
  return {opener, openerTop};
}

async function openDialog(page: Page, opener: Locator): Promise<Locator> {
  // A programmatic click moves no focus, so the region stays the recorded
  // opener in every engine, as a tap leaves it in Safari.
  await opener.evaluate(node => (node as HTMLElement).click());
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect
    .poll(async () =>
      dialog.evaluate(node => node.getAnimations({subtree: true}).length),
    )
    .toBe(0);
  return dialog;
}

async function expectPageStill(
  page: Page,
  opener: Locator,
  openerTop: number,
): Promise<void> {
  await expect(page.getByRole('dialog')).toBeHidden();
  // The close, the focus return and the lock's release are spread over a few
  // tasks, and a reveal scroll lands a rendering update after the focus move.
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.scrollY)).toBe(SCROLL_OFFSET);
  expect(await opener.evaluate(node => node.getBoundingClientRect().top)).toBe(
    openerTop,
  );
}

test('a close from a button in the dialog keeps the page where it was', async ({
  page,
}) => {
  const {opener, openerTop} = await mountScrolled(page);
  const dialog = await openDialog(page, opener);
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  await expectPageStill(page, opener, openerTop);
});

test('a backdrop close keeps the page where it was', async ({page}) => {
  const {opener, openerTop} = await mountScrolled(page);
  await openDialog(page, opener);
  await page.mouse.click(20, 20);
  await expectPageStill(page, opener, openerTop);
});

test('an Escape close keeps the page where it was', async ({page}) => {
  const {opener, openerTop} = await mountScrolled(page);
  await openDialog(page, opener);
  await page.keyboard.press('Escape');
  await expectPageStill(page, opener, openerTop);
});

test('an Escape close keeps the page where it was when the recorded opener is a Tab-stop region larger than the viewport', async ({
  page,
}) => {
  // A Tab stop too large to fit the viewport, such as a scrollable table
  // viewport WebKit records for a tapped button, is not revealed.
  const {opener, openerTop} = await mountScrolled(page, 0);
  await openDialog(page, opener);
  await page.keyboard.press('Escape');
  await expectPageStill(page, opener, openerTop);
});

const SPACER_HEIGHT = 3000;

/** Puts the story below a tall spacer, scrolls to the top, and focuses the
 * opener without a scroll, so the focused opener is off screen. */
async function mountOpenerOffScreen(page: Page) {
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
  expect(await isOpenerInViewport(page)).toBe(false);
  return opener;
}

async function isOpenerInViewport(page: Page): Promise<boolean> {
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
  const opener = await mountOpenerOffScreen(page);
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await expect(opener).toBeFocused();
  await expect.poll(async () => isOpenerInViewport(page)).toBe(true);
  // Just into view (`nearest`): the opener came from below, so it stops at the
  // viewport's bottom edge, not at its centre or top.
  const gapBelow = await opener.evaluate(
    node => window.innerHeight - node.getBoundingClientRect().bottom,
  );
  expect(gapBelow).toBeGreaterThanOrEqual(0);
  expect(gapBelow).toBeLessThanOrEqual(2);
});
