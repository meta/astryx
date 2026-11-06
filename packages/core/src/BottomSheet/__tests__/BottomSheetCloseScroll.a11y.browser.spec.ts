// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y always

/**
 * @file BottomSheetCloseScroll.a11y.browser.spec.ts
 * @input The `Core/BottomSheet` showcase story in a built Storybook, placed
 *   in a tall focusable main region of a scrolled page, as an app places a
 *   sheet's trigger.
 * @output Real-engine proof that closing a modal sheet keeps the page where it
 *   was: the scroll offset and the trigger's place on screen are the same
 *   after a pointer close (Apply, the scrim) and after Escape.
 * @position Chromium and WebKit. The page focuses the region before a
 *   programmatic click opens the sheet, as a tap leaves focus in Safari, where
 *   a button is not mouse-focusable; the sheet then records the region as its
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
async function mountScrolled(page: Page) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-bottomsheet--showcase&viewMode=story`,
  );
  const opener = page.getByRole('button', {name: 'Open sheet', exact: true});
  await expect(opener).toBeVisible();
  await page.evaluate(
    ({headerHeight, scrollOffset}) => {
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
      main.tabIndex = -1;
      root.parentNode.insertBefore(spacer(headerHeight), root);
      root.parentNode.insertBefore(main, root);
      main.append(spacer(400), root, spacer(3000));
      window.scrollTo(0, scrollOffset);
      // Where Safari puts focus on a tap inside the region: a button is not
      // mouse-focusable there, so its nearest focusable ancestor takes it.
      main.focus({preventScroll: true});
    },
    {headerHeight: HEADER_HEIGHT, scrollOffset: SCROLL_OFFSET},
  );
  await expect
    .poll(async () => page.evaluate(() => window.scrollY))
    .toBe(SCROLL_OFFSET);
  const openerTop = await opener.evaluate(
    node => node.getBoundingClientRect().top,
  );
  return {opener, openerTop};
}

async function openSheet(page: Page, opener: Locator): Promise<Locator> {
  // A programmatic click moves no focus, so the region stays the recorded
  // opener in every engine, as a tap leaves it in Safari.
  await opener.evaluate(node => (node as HTMLElement).click());
  const dialog = page.getByRole('dialog', {name: 'Filters'});
  await expect(dialog).toBeVisible();
  // A close during the entrance reverses it; let the sheet settle first so
  // that the close plays a full exit.
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
  // The exit's last frame, the focus return and the lock's release are
  // spread over a few tasks, and a reveal scroll lands a rendering update
  // after the focus move.
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.scrollY)).toBe(SCROLL_OFFSET);
  expect(await opener.evaluate(node => node.getBoundingClientRect().top)).toBe(
    openerTop,
  );
}

test('a close from a button in the sheet keeps the page where it was', async ({
  page,
}) => {
  const {opener, openerTop} = await mountScrolled(page);
  const dialog = await openSheet(page, opener);
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expectPageStill(page, opener, openerTop);
});

test('a scrim close keeps the page where it was', async ({page}) => {
  const {opener, openerTop} = await mountScrolled(page);
  await openSheet(page, opener);
  await page.mouse.click(20, 20);
  await expectPageStill(page, opener, openerTop);
});

test('an Escape close keeps the page where it was', async ({page}) => {
  const {opener, openerTop} = await mountScrolled(page);
  await openSheet(page, opener);
  await page.keyboard.press('Escape');
  await expectPageStill(page, opener, openerTop);
});
