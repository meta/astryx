// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file NavMenusSlideSelection.a11y.chromium.spec.ts
 * @input The built TopNav With Heading Menu (NavHeadingMenu), TopNavMenu
 *   Default and TabList With Menu stories, in Chromium, with a real mouse
 * @output Proof that a mouse slide from one item to the next selects no
 *   text in NavHeadingMenu (in TopNavHeading's and an expanded SideNavHeading's
 *   menus), TopNavMenu and TabMenu, while held and after the lift
 * @position Evidence for the action-group slide in /packages/core/src/NavMenu,
 *   TopNav and TabList (`family:action-groups` FR1-FR2)
 */

import {expect, test, type Page} from '@playwright/test';
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

async function mount(page: Page, story: string) {
  await page.goto(`${storybook.origin}/iframe.html?id=${story}&viewMode=story`);
  await expect(page.locator('#storybook-root')).toBeVisible();
}

async function centerOf(page: Page, selector: string, index: number) {
  const box = await page.locator(selector).nth(index).boundingBox();
  if (box == null) {
    throw new Error(`${selector} #${index} has no rendered bounds`);
  }
  return {x: box.x + box.width / 2, y: box.y + box.height / 2};
}

async function selectedText(page: Page): Promise<string> {
  return page.evaluate(() => window.getSelection()?.toString() ?? '');
}

/**
 * Press the first item's text, slide to the second, and lift there. Returns
 * the selected text while the pointer is held and after the lift.
 */
async function slideFirstToSecond(page: Page, item: string, text?: string) {
  await expect(page.locator(item).nth(1)).toBeVisible();
  const first = await (
    text == null
      ? page.locator(item).nth(0)
      : page.locator(item).nth(0).getByText(text, {exact: true})
  ).boundingBox();
  const to = await centerOf(page, item, 1);
  if (first == null) {
    throw new Error(`${item} #0 has no rendered bounds`);
  }
  // Start on the label's text, where a browser selection begins.
  await page.mouse.move(first.x + 12, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, {steps: 8});
  const held = await selectedText(page);
  await page.mouse.up();
  return {held, lifted: await selectedText(page)};
}

const MENU_ITEMS = '[role="menu"] [role="menuitem"]';

test.describe('nav and tab menus: a mouse slide selects no text (Chromium)', () => {
  test('NavHeadingMenu, in TopNavHeading’s product menu', async ({page}) => {
    await mount(page, 'core-topnav--with-heading-menu');
    // The trigger overlays the heading; a click at its center opens the menu.
    await page
      .locator('#storybook-root button[aria-haspopup]')
      .first()
      .click({force: true});
    expect(await slideFirstToSecond(page, MENU_ITEMS)).toEqual({
      held: '',
      lifted: '',
    });
  });

  test('NavHeadingMenu, in an expanded SideNavHeading’s menu', async ({
    page,
  }) => {
    await mount(page, 'core-sidenav--with-header-menu-items');
    await page
      .locator('#storybook-root button[aria-haspopup]')
      .first()
      .click({force: true});
    expect(await slideFirstToSecond(page, MENU_ITEMS)).toEqual({
      held: '',
      lifted: '',
    });
  });

  test('TopNavMenu', async ({page}) => {
    await mount(page, 'core-topnavmenu--default');
    await page
      .locator('#storybook-root button', {hasText: 'Products'})
      .first()
      .click();
    expect(await slideFirstToSecond(page, MENU_ITEMS)).toEqual({
      held: '',
      lifted: '',
    });
  });

  test('TopNavMenu, on action items with no destination', async ({page}) => {
    await mount(page, 'core-topnavmenu--action-items');
    await page
      .locator('#storybook-root button', {hasText: 'Actions'})
      .first()
      .click();
    // Start on the title text, past the icon cell.
    expect(
      await slideFirstToSecond(page, MENU_ITEMS, 'Invite teammates'),
    ).toEqual({held: '', lifted: ''});
  });

  test('TabMenu', async ({page}) => {
    await mount(page, 'core-tablist--with-menu');
    await page
      .locator('#storybook-root button[aria-haspopup]', {hasText: 'More'})
      .first()
      .click();
    expect(
      await slideFirstToSecond(page, '[role="menu"] [role="menuitemradio"]'),
    ).toEqual({held: '', lifted: ''});
  });
});
