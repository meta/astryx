// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file createContextMenu.interaction.browser.spec.ts
 * @input The built "Headless / createContextMenu on a list row" ContextMenu
 *   story, the engine's own finger, a mouse and the keyboard
 * @output Real-browser proof of the headless context menu (spec:AST-107
 *   FR8): a held finger, a right click and Shift+F10 each open it once on a
 *   list row; its lift clicks nothing; a key focuses the first row; Escape
 *   returns focus to the row; a choice runs once and the row hears no click;
 *   the list keeps only its `li` rows; useContextMenu opens the same menu
 * @position Run with `pnpm test:interaction createContextMenu`
 */

import {expect, test, type Page} from '@playwright/test';
import {
  openStory,
  tap,
  touchDriver,
  withStorybook,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);
const STORY = 'core-contextmenu--headless-on-a-list-row';

async function centerOf(page: Page, testId: string) {
  const box = await page.getByTestId(testId).boundingBox();
  if (box == null) {
    throw new Error(`no ${testId}`);
  }
  return {x: box.x + box.width / 2, y: box.y + box.height / 2};
}

const log = (page: Page) => page.getByTestId('headless-log');
const focusedRole = async (page: Page) =>
  page.evaluate(() => document.activeElement?.getAttribute('role') ?? null);

test('a finger held on a list row opens its menu once, and the lift clicks nothing (spec:AST-107 FR8)', async ({
  page,
}) => {
  await openStory(page, storybook(), STORY);
  const driver = await touchDriver(page);
  const at = await centerOf(page, 'headless-row');
  // Held past the long press, then lifted.
  await driver.play(tap(at, {holdMs: 1200, id: 1}));
  await expect(page.getByRole('menu', {name: 'Inbox actions'})).toBeVisible();
  await page.waitForTimeout(300);
  await expect(page.getByRole('menu', {name: 'Inbox actions'})).toBeVisible();
  await expect(log(page)).toHaveText('open');
});

test('a right click and Shift+F10 open it with the first row focused, and Escape returns focus to the row (spec:AST-107 FR8)', async ({
  page,
}) => {
  await openStory(page, storybook(), STORY);
  const at = await centerOf(page, 'headless-row');
  await page.mouse.click(at.x, at.y, {button: 'right'});
  const menu = page.getByRole('menu', {name: 'Inbox actions'});
  await expect(menu).toBeVisible();
  await expect.poll(async () => focusedRole(page)).toBe('menuitem');
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await page.getByTestId('headless-row').focus();
  await page.keyboard.press('Shift+F10');
  await expect(menu).toBeVisible();
  await expect.poll(async () => focusedRole(page)).toBe('menuitem');
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect
    .poll(async () =>
      page.evaluate(() => document.activeElement?.getAttribute('data-testid')),
    )
    .toBe('headless-row');
  await expect(log(page)).toHaveText('open,close,open,close');
});

test('a choice runs once and closes the menu, the row hears no click, and the list keeps only its rows (spec:AST-107 FR8)', async ({
  page,
}) => {
  await openStory(page, storybook(), STORY);
  const at = await centerOf(page, 'headless-row');
  await page.mouse.click(at.x, at.y, {button: 'right'});
  await expect(page.getByRole('menu', {name: 'Inbox actions'})).toBeVisible();
  expect(
    await page
      .getByTestId('headless-list')
      .evaluate(list => Array.from(list.children, child => child.localName)),
  ).toEqual(['li', 'li', 'li']);
  await page.getByRole('menuitem', {name: 'Archive'}).click();
  await expect(page.getByRole('menu', {name: 'Inbox actions'})).toBeHidden();
  await expect(log(page)).toHaveText('open,archive,close');
});

test('useContextMenu opens the same menu from a component (spec:AST-107 FR8)', async ({
  page,
}) => {
  await openStory(page, storybook(), STORY);
  const at = await centerOf(page, 'hook-row');
  await page.mouse.click(at.x, at.y, {button: 'right'});
  await expect(page.getByRole('menu', {name: 'Sent actions'})).toBeVisible();
  await page.getByRole('menuitem', {name: 'Forward'}).click();
  await expect(log(page)).toHaveText('forward');
});
