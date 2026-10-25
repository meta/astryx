// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MenuHoverFocus.a11y.chromium.spec.ts
 * @input The `Core/DropdownMenu` Default, LabCheckboxItems, LabRadioGroup and
 *   Submenu stories, the `Core/ContextMenu` Default story and the
 *   `Core/Breadcrumbs` Menu Crumb story in a built
 *   Storybook, with real mouse and keyboard input.
 * @output Real-engine evidence that focus the pointer moves onto a row (a
 *   resting mouse, or a held press dragged over it) follows the last input
 *   (`architecture:interaction-modality` INV1): after a pointer press the row
 *   does not match `:focus-visible`, an arrow key afterwards moves focus to a
 *   row that does, and after a keyboard open the indicator stays. A first case
 *   checks that the browser running them honors `FocusOptions.focusVisible`
 *   and records its version.
 * @position Run with `pnpm test:a11y-contract`; jsdom has no `:focus-visible`
 *   heuristic, so only a real engine shows whether hover focus would paint a
 *   keyboard-only focus style.
 */

import {expect, test, type Locator, type Page} from '@playwright/test';
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

async function gotoStory(page: Page, id: string) {
  await page.goto(`${storybook.origin}/iframe.html?id=${id}&viewMode=story`);
}

async function center(target: Locator): Promise<{x: number; y: number}> {
  const box = await target.boundingBox();
  if (box == null) {
    throw new Error('the element has no layout box');
  }
  return {x: box.x + box.width / 2, y: box.y + box.height / 2};
}

async function matchesFocusVisible(target: Locator): Promise<boolean> {
  return target.evaluate(el => el.matches(':focus-visible'));
}

/** Rests the mouse on a row; the menu moves focus to it. */
async function hover(page: Page, row: Locator) {
  const {x, y} = await center(row);
  await page.mouse.move(x, y, {steps: 4});
  await expect(row).toBeFocused();
}

test('the browser running these cases honors FocusOptions.focusVisible', async ({
  page,
  browser,
  browserName,
}) => {
  test.info().annotations.push({
    type: 'browser',
    description: `${browserName} ${browser.version()}`,
  });
  const markup =
    '<button id="key">Key</button><div id="row" tabindex="-1">Row</div>';
  // After a key press, a plain focus() inherits :focus-visible...
  await page.setContent(markup);
  await page.keyboard.press('Tab');
  await expect(page.locator('#key')).toBeFocused();
  const plain = await page.locator('#row').evaluate((row: HTMLElement) => {
    row.focus();
    return row.matches(':focus-visible');
  });
  expect(plain).toBe(true);
  // ...and the option keeps it from matching. Chrome and Edge from 145,
  // Firefox from 104 and Safari from 18.4 honor it; an older engine ignores
  // it, and the cases below would then fail for that reason alone.
  await page.setContent(markup);
  await page.keyboard.press('Tab');
  await expect(page.locator('#key')).toBeFocused();
  const withOption = await page.locator('#row').evaluate((row: HTMLElement) => {
    row.focus({focusVisible: false});
    return row.matches(':focus-visible');
  });
  expect(
    withOption,
    `${browserName} ${browser.version()} ignores FocusOptions.focusVisible`,
  ).toBe(false);
});

test('after a pointer open, rows the mouse rests on take focus without :focus-visible, and ArrowDown afterwards gets it', async ({
  page,
}) => {
  await gotoStory(page, 'core-dropdownmenu--default');
  await page.getByRole('button', {name: 'Actions'}).click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();

  const edit = menu.getByRole('menuitem', {name: 'Edit'});
  const duplicate = menu.getByRole('menuitem', {name: 'Duplicate'});
  const del = menu.getByRole('menuitem', {name: 'Delete'});
  await hover(page, edit);
  expect(await matchesFocusVisible(edit)).toBe(false);
  await hover(page, duplicate);
  expect(await matchesFocusVisible(duplicate)).toBe(false);

  // The keyboard takes over from where the mouse left the highlight.
  await page.keyboard.press('ArrowDown');
  await expect(del).toBeFocused();
  expect(await matchesFocusVisible(del)).toBe(true);
});

test('in a Breadcrumbs menu alone on the page, rows the mouse rests on take focus without :focus-visible after a pointer open', async ({
  page,
}) => {
  // Nothing else on this page activates the modality tracking, so the menu
  // crumb must activate it itself.
  await gotoStory(page, 'core-breadcrumbs--menu-crumb');
  await page.getByRole('button', {name: 'Teams'}).click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  const design = menu.getByRole('menuitem', {name: 'Design'});
  const engineering = menu.getByRole('menuitem', {name: 'Engineering'});
  await hover(page, design);
  expect(await matchesFocusVisible(design)).toBe(false);
  await hover(page, engineering);
  expect(await matchesFocusVisible(engineering)).toBe(false);
});

test('after a keyboard open, a row the mouse moves to keeps the indicator: no pointer press changed the last input', async ({
  page,
}) => {
  await gotoStory(page, 'core-dropdownmenu--default');
  await page.getByRole('button', {name: 'Actions'}).focus();
  await page.keyboard.press('ArrowDown');
  const menu = page.getByRole('menu');
  const edit = menu.getByRole('menuitem', {name: 'Edit'});
  await expect(edit).toBeFocused();
  expect(await matchesFocusVisible(edit)).toBe(true);

  const del = menu.getByRole('menuitem', {name: 'Delete'});
  await hover(page, del);
  expect(await matchesFocusVisible(del)).toBe(true);
});

test('checkbox, radio and sub-menu rows the mouse rests on take focus without :focus-visible after a pointer open', async ({
  page,
}) => {
  const cases = [
    {
      story: 'core-dropdownmenu--lab-checkbox-items',
      button: 'View',
      role: 'menuitemcheckbox',
      name: 'Show drafts',
    },
    {
      story: 'core-dropdownmenu--lab-radio-group',
      button: 'Sort',
      role: 'menuitemradio',
      name: 'Oldest',
    },
    {
      story: 'core-dropdownmenu--submenu',
      button: 'Actions',
      role: 'menuitem',
      name: 'Move to',
    },
  ] as const;
  for (const {story, button, role, name} of cases) {
    await gotoStory(page, story);
    const trigger = page.getByRole('button', {name: button});
    await expect(trigger).toBeVisible();
    // A story may open its own menu on load; close it, so the open below is
    // a pointer press.
    const menu = page.getByRole('menu').first();
    if (await menu.isVisible()) {
      await page.keyboard.press('Escape');
      await expect(menu).toBeHidden();
    }
    await trigger.click();
    const row = menu.getByRole(role, {name});
    await expect(row).toBeVisible();
    await hover(page, row);
    expect(await matchesFocusVisible(row), `${role} "${name}"`).toBe(false);
  }
});

test('a ContextMenu row the mouse rests on takes focus without :focus-visible, and ArrowDown afterwards gets it', async ({
  page,
}) => {
  await gotoStory(page, 'core-contextmenu--default');
  const area = page.getByText('Right-click this area');
  const {x, y} = await center(area);
  await page.mouse.click(x, y, {button: 'right'});
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();

  // Not the first row: the menu's own open focuses that one.
  const copy = menu.getByRole('menuitem', {name: 'Copy'});
  await hover(page, copy);
  expect(await matchesFocusVisible(copy)).toBe(false);

  await page.keyboard.press('ArrowDown');
  const paste = menu.getByRole('menuitem', {name: 'Paste'});
  await expect(paste).toBeFocused();
  expect(await matchesFocusVisible(paste)).toBe(true);
});

test('a row a held press is dragged over takes focus without :focus-visible', async ({
  page,
}) => {
  await gotoStory(page, 'core-dropdownmenu--default');
  const trigger = page.getByRole('button', {name: 'Actions'});
  const start = await center(trigger);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();

  const duplicate = menu.getByRole('menuitem', {name: 'Duplicate'});
  const over = await center(duplicate);
  await page.mouse.move(over.x, over.y, {steps: 8});
  await expect(duplicate).toBeFocused();
  expect(await matchesFocusVisible(duplicate)).toBe(false);

  // Releasing over the row picks it, as the press model does.
  await page.mouse.up();
  await expect(menu).toBeHidden();
});
