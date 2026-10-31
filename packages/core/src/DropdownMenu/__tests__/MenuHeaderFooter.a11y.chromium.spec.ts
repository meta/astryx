// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y always

/**
 * @file MenuHeaderFooter.a11y.chromium.spec.ts
 * @input The `Core/DropdownMenu` HeaderAndFooter story in a built Storybook
 *   and real keyboard and mouse input.
 * @output Real-engine proof that a menu's header and footer sit beside the
 *   menu rather than inside it, keep their own keys and presses, and join one
 *   Tab sequence with the menu.
 * @position Run with `pnpm test:a11y-contract`.
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

const STORY = 'core-dropdownmenu--header-and-footer';
// The trigger button only: the sub-menu row inside the menu also carries
// aria-haspopup. With a header and footer the trigger opens a dialog.
const TRIGGER = '#storybook-root button[aria-haspopup="dialog"]';

async function openMenu(page: Page) {
  await page.goto(`${storybook.origin}/iframe.html?id=${STORY}&viewMode=story`);
  await page.locator(TRIGGER).click();
  const menu = page.getByRole('menu', {name: 'Labels', exact: true});
  await expect(menu).toBeVisible();
  // A pointer open focuses the menu itself; let that land first.
  await expect(menu).toBeFocused();
  return menu;
}

test('the menu holds only its rows; the field and button sit beside it', async ({
  page,
}) => {
  const menu = await openMenu(page);
  // The menu holds menu items, plus the sub-menu row's own nested menu.
  const roles = await menu.evaluate(el =>
    Array.from(el.querySelectorAll('[role]')).map(n => n.getAttribute('role')),
  );
  expect(roles.every(r => r === 'menuitem' || r === 'menu')).toBe(true);
  expect(roles).toContain('menuitem');
  await expect(menu.getByRole('textbox', {name: 'Filter labels'})).toHaveCount(
    0,
  );
  await expect(menu.getByRole('button', {name: 'Create label'})).toHaveCount(0);
  await expect(
    page.getByRole('textbox', {name: 'Filter labels'}),
  ).toBeVisible();
  await expect(page.getByRole('button', {name: 'Create label'})).toBeVisible();
});

test('typing into the header field filters without moving to a row', async ({
  page,
}) => {
  await openMenu(page);
  const field = page.getByRole('textbox', {name: 'Filter labels'});
  await field.click();
  await page.keyboard.type('de');
  await expect(field).toHaveValue('de');
  await expect(field).toBeFocused();
  await expect(page.getByRole('menuitem')).toHaveText(['Design', 'Move to']);
});

test('Tab walks header, menu, footer, and wraps at both ends', async ({
  page,
}) => {
  const menu = await openMenu(page);
  const field = page.getByRole('textbox', {name: 'Filter labels'});
  const create = page.getByRole('button', {name: 'Create label'});

  await page.keyboard.press('Shift+Tab');
  await expect(field).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(menu).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', {name: 'Bug'})).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(create).toBeFocused();
  await expect(menu).toBeVisible();

  await page.keyboard.press('Enter');
  await expect(page.getByTestId('created')).toHaveText('1');
  await expect(menu).toBeVisible();

  // Past the footer's last control, Tab wraps to the header; before the
  // header's first, Shift+Tab wraps to the footer. The dialog stays open.
  await page.keyboard.press('Tab');
  await expect(field).toBeFocused();
  await expect(menu).toBeVisible();
  await page.keyboard.press('Shift+Tab');
  await expect(create).toBeFocused();
  await expect(menu).toBeVisible();
  await expect(page.locator(TRIGGER)).toHaveAttribute('aria-expanded', 'true');
});

test('the popover is a modal dialog around the menu, and the trigger points at it', async ({
  page,
}) => {
  const menu = await openMenu(page);
  const dialog = page.getByRole('dialog', {name: 'Labels'});
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(
    dialog.getByRole('menu', {name: 'Labels', exact: true}),
  ).toBeVisible();
  await expect(
    dialog.getByRole('textbox', {name: 'Filter labels'}),
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', {name: 'Create label'}),
  ).toBeVisible();
  const trigger = page.locator(TRIGGER);
  await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
  const controlsDialog = await trigger.evaluate(el => {
    const target = document.getElementById(
      el.getAttribute('aria-controls') ?? '',
    );
    const dialogEl = document.querySelector('[role="dialog"]');
    return target != null && dialogEl != null && target.contains(dialogEl);
  });
  expect(controlsDialog).toBe(true);
  await expect(menu).toBeFocused();
});

test('Shift+Tab from a row goes straight to the header', async ({page}) => {
  const menu = await openMenu(page);
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', {name: 'Bug'})).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(
    page.getByRole('textbox', {name: 'Filter labels'}),
  ).toBeFocused();
  await expect(menu).toBeVisible();
});

test('a mouse open draws no keyboard focus ring on the menu', async ({
  page,
}) => {
  const menu = await openMenu(page);
  const outlineStyle = await menu.evaluate(
    el => getComputedStyle(el).outlineStyle,
  );
  expect(outlineStyle).toBe('none');
});

test('keyboard focus on the menu between the regions is visible', async ({
  page,
}) => {
  const menu = await openMenu(page);
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(menu).toBeFocused();
  const outline = await menu.evaluate(el => {
    const style = getComputedStyle(el);
    return {style: style.outlineStyle, width: parseFloat(style.outlineWidth)};
  });
  expect(outline.style).not.toBe('none');
  expect(outline.width).toBeGreaterThan(0);
});

test('Tab and Shift+Tab from an open sub-menu close it and reach a region', async ({
  page,
}) => {
  const menu = await openMenu(page);
  const subTrigger = page.getByRole('menuitem', {name: 'Move to'});
  await page.keyboard.press('End');
  await expect(subTrigger).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('menuitem', {name: 'Archive'})).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', {name: 'Create label'})).toBeFocused();
  await expect(subTrigger).toHaveAttribute('aria-expanded', 'false');
  await expect(menu).toBeVisible();

  await page.keyboard.press('Shift+Tab');
  await expect(menu).toBeFocused();
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('menuitem', {name: 'Archive'})).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(
    page.getByRole('textbox', {name: 'Filter labels'}),
  ).toBeFocused();
  await expect(subTrigger).toHaveAttribute('aria-expanded', 'false');
});

test('Escape in the header closes the menu and returns focus to the trigger', async ({
  page,
}) => {
  const menu = await openMenu(page);
  await page.getByRole('textbox', {name: 'Filter labels'}).click();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(page.locator(TRIGGER)).toBeFocused();
});

test('a finger tap on the footer button acts and the menu stays open', async ({
  browser,
}) => {
  const context = await browser.newContext({hasTouch: true, isMobile: true});
  const page = await context.newPage();
  try {
    await page.goto(
      `${storybook.origin}/iframe.html?id=${STORY}&viewMode=story`,
    );
    await page.locator(TRIGGER).tap();
    const menu = page.getByRole('menu', {name: 'Labels', exact: true});
    await expect(menu).toBeVisible();
    await page.getByRole('button', {name: 'Create label'}).tap();
    await expect(page.getByTestId('created')).toHaveText('1');
    await expect(menu).toBeVisible();
  } finally {
    await context.close();
  }
});
