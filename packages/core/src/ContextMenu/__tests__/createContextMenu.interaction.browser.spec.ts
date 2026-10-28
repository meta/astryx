// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file createContextMenu.interaction.browser.spec.ts
 * @input The built "Headless / createContextMenu on a list row" ContextMenu
 *   story, the engine's own finger, a mouse and the keyboard
 * @output Real-browser proof of the headless context menu (spec:AST-107
 *   FR8): a held finger, a right click and Shift+F10 each open it once on a
 *   list row; its lift clicks nothing; a held finger lifts the row (spec:AST-094
 *   FR33), and Escape returns focus to it even from another row's focus; a
 *   key focuses the first row; Escape returns focus to the row; a choice runs once and the row hears no click;
 *   the list keeps only its `li` rows; useContextMenu opens the same menu,
 *   and its `menuContent` rows act once under a mouse and close the menu; on
 *   a row inside a modal dialog the menu takes focus and a choice acts
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

test('with another row focused, a finger held on a list row lifts the row and opens its menu, and Escape returns focus to that row (spec:AST-094 FR33, spec:AST-107 FR8)', async ({
  page,
}) => {
  await openStory(page, storybook(), STORY);
  await page.getByText('Drafts', {exact: true}).focus();
  const driver = await touchDriver(page);
  const at = await centerOf(page, 'headless-row');
  await driver.play(tap(at, {holdMs: 1200, id: 1}));
  const menu = page.getByRole('menu', {name: 'Inbox actions'});
  await expect(menu).toBeVisible();
  // The row lifts as UIKit's preview does: the lift layer is up beside the
  // menu.
  await expect(
    page.locator('[data-astryx-context-menu-lift]').first(),
  ).toBeAttached();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect
    .poll(async () =>
      page.evaluate(() => document.activeElement?.getAttribute('data-testid')),
    )
    .toBe('headless-row');
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
  ).toEqual(['li', 'li', 'li', 'li']);
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

test("useContextMenu's menuContent rows act once under a mouse, and choosing one closes the menu (spec:AST-107 FR8)", async ({
  page,
}) => {
  await openStory(page, storybook(), STORY);
  const at = await centerOf(page, 'hook-content-row');
  await page.mouse.click(at.x, at.y, {button: 'right'});
  const menu = page.getByRole('menu', {name: 'Archive actions'});
  await expect(menu).toBeVisible();
  await expect.poll(async () => focusedRole(page)).toBe('menuitem');
  // A press and a release on the row: the release acts, and the browser's
  // own click after it acts on nothing.
  await page.getByRole('menuitem', {name: 'Restore'}).click();
  await expect(menu).toBeHidden();
  await page.waitForTimeout(300);
  await expect(log(page)).toHaveText('restore');
});

test('on a row inside a transformed dialog, as a Drawer is, the menu opens at the pointer (spec:AST-107 FR8)', async ({
  page,
}) => {
  await openStory(page, storybook(), STORY);
  // The row moves into a modal dialog on the right that keeps a transform,
  // as a Drawer's does: the dialog is then the containing block of every
  // fixed box inside it.
  await page.evaluate(() => {
    const row = document.querySelector('[data-testid="headless-row"]');
    if (row == null) {
      throw new Error('no row');
    }
    const dialog = document.createElement('dialog');
    dialog.style.transform = 'translateX(0)';
    dialog.style.margin = '80px 0 0 auto';
    dialog.style.width = '360px';
    const list = document.createElement('ul');
    list.append(row);
    dialog.append(list);
    document.body.append(dialog);
    dialog.showModal();
  });
  const at = await centerOf(page, 'headless-row');
  await page.mouse.click(at.x, at.y, {button: 'right'});
  const menu = page.getByRole('menu', {name: 'Inbox actions'});
  await expect(menu).toBeVisible();
  const box = await menu.boundingBox();
  if (box == null) {
    throw new Error('no menu box');
  }
  // The pointer sits at one of the menu's corners, whichever way it opens.
  const nearestX = Math.min(
    Math.abs(box.x - at.x),
    Math.abs(box.x + box.width - at.x),
  );
  const nearestY = Math.min(
    Math.abs(box.y - at.y),
    Math.abs(box.y + box.height - at.y),
  );
  expect(nearestX).toBeLessThan(12);
  expect(nearestY).toBeLessThan(12);
});

test('on a row inside a modal dialog, the menu takes focus and a choice acts (spec:AST-107 FR8)', async ({
  page,
}) => {
  await openStory(page, storybook(), STORY);
  // The row moves into a modal dialog, which leaves everything outside it
  // inert.
  await page.evaluate(() => {
    const row = document.querySelector('[data-testid="headless-row"]');
    if (row == null) {
      throw new Error('no row');
    }
    const dialog = document.createElement('dialog');
    const list = document.createElement('ul');
    list.append(row);
    dialog.append(list);
    document.body.append(dialog);
    dialog.showModal();
  });
  const at = await centerOf(page, 'headless-row');
  await page.mouse.click(at.x, at.y, {button: 'right'});
  const menu = page.getByRole('menu', {name: 'Inbox actions'});
  await expect(menu).toBeVisible();
  await expect.poll(async () => focusedRole(page)).toBe('menuitem');
  await page.getByRole('menuitem', {name: 'Archive'}).click();
  await expect(menu).toBeHidden();
  await expect(log(page)).toHaveText('open,archive,close');
});
