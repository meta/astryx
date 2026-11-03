// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y always

/**
 * @file SubMenuHeaderFooter.a11y.chromium.spec.ts
 * @input The built Storybook "Submenu / header and footer" story (a Labels
 *   sub-menu with a filter field above its checkbox rows and a "Create label"
 *   button below them) and real Chromium, once as a laptop (fine pointer) and
 *   once as a phone (coarse pointer, touch).
 * @output Evidence for component:DropdownMenu FR20: a sub-menu's header and
 *   footer sit with its rows in a modal dialog named by its row, beside every
 *   menu element rather than inside one; the row says it opens a dialog; Tab
 *   and Shift+Tab walk field, rows and button and wrap; typing filters the
 *   rows and Escape returns to the row; a pick keeps the sub-menu open. On a
 *   phone the drilled-in view holds the same regions while the root menu
 *   steps aside. On the "Submenu / header with a choice" story, a flyout the
 *   pointer has left stays open while an arrow moves the header's radio choice.
 * @position Browser proof behind the jsdom suite: the accessibility tree, real
 *   Tab order and the pointer decision are what jsdom cannot exercise.
 */

import {devices, expect, test, type Locator, type Page} from '@playwright/test';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

let storybook: StaticServer;
const storyId = 'core-dropdownmenu--sub-menu-header-and-footer';

test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

async function mount(page: Page) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=${storyId}&viewMode=story`,
  );
  await expect(page.getByTestId('submenu-regions-fixture')).toBeVisible();
}

/** Whether the element sits inside any role="menu" element. */
async function isInsideAMenu(page: Page, testName: string): Promise<boolean> {
  return page
    .getByRole('dialog', {name: testName})
    .evaluate(el => el.parentElement?.closest('[role="menu"]') != null);
}

async function bounds(locator: Locator) {
  const rect = await locator.boundingBox();
  if (rect == null) {
    throw new Error('no rendered bounds');
  }
  return rect;
}

test.describe('on a laptop (fine pointer)', () => {
  test('the sub-menu opens a dialog beside the menu, named by its row, holding field, rows and button', async ({
    page,
  }) => {
    await mount(page);
    await page.getByRole('button', {name: 'Session'}).click();
    const row = page.getByRole('menuitem', {name: 'Labels'});
    await expect(row).toHaveAttribute('aria-haspopup', 'dialog');
    await row.click();

    const dialog = page.getByRole('dialog', {name: 'Labels'});
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(row).toHaveAttribute(
      'aria-controls',
      (await dialog.getAttribute('id')) ?? '',
    );
    expect(await isInsideAMenu(page, 'Labels')).toBe(false);
    // The sub-menu's own menu holds only its rows.
    const menu = dialog.getByRole('menu', {name: 'Labels'});
    expect(
      await menu.evaluate(el =>
        Array.from(el.querySelectorAll('[role]')).map(child =>
          child.getAttribute('role'),
        ),
      ),
    ).toEqual(Array(5).fill('menuitemcheckbox'));
    await expect(
      dialog.getByRole('textbox', {name: 'Filter labels'}),
    ).toBeVisible();
    await expect(
      dialog.getByRole('button', {name: 'Create label'}),
    ).toBeVisible();
  });

  test('Tab and Shift+Tab walk field, rows and button and wrap; typing filters; Escape returns to the row', async ({
    page,
  }) => {
    await mount(page);
    const trigger = page.getByRole('button', {name: 'Session'});
    await trigger.focus();
    await page.keyboard.press('Enter');
    // A keyboard open lands on the first row; let it land before moving on.
    await expect(page.getByRole('menuitem', {name: 'Rename'})).toBeFocused();
    const row = page.getByRole('menuitem', {name: 'Labels'});
    await page.keyboard.press('ArrowDown');
    await expect(row).toBeFocused();
    await page.keyboard.press('ArrowRight');

    const dialog = page.getByRole('dialog', {name: 'Labels'});
    const field = dialog.getByRole('textbox', {name: 'Filter labels'});
    const create = dialog.getByRole('button', {name: 'Create label'});
    const menu = dialog.getByRole('menu', {name: 'Labels'});
    // A keyboard open lands on the first row, not the field.
    await expect(
      dialog.getByRole('menuitemcheckbox', {name: 'Bug'}),
    ).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(create).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(field).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(menu).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(field).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(create).toBeFocused();
    await expect(dialog).toBeVisible();

    // The field keeps its keys: letters type and filter the rows, and the
    // arrow that closes a sub-menu from a row moves the caret instead.
    await field.focus();
    await page.keyboard.type('doc');
    await page.keyboard.press('ArrowLeft');
    await expect(field).toHaveValue('doc');
    await expect(dialog.getByRole('menuitemcheckbox')).toHaveText([
      'Documentation',
    ]);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(row).toBeFocused();
    await expect(page.getByRole('menu', {name: 'Session'})).toBeVisible();
  });

  test('a pick keeps the sub-menu open; the button acts without closing anything', async ({
    page,
  }) => {
    await mount(page);
    await page.getByRole('button', {name: 'Session'}).click();
    await page.getByRole('menuitem', {name: 'Labels'}).click();
    const dialog = page.getByRole('dialog', {name: 'Labels'});
    await dialog.getByRole('menuitemcheckbox', {name: 'Feature'}).click();
    await expect(page.getByTestId('picked')).toHaveText('Bug, Feature');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', {name: 'Create label'}).click();
    await expect(page.getByTestId('created')).toHaveText('1');
    await expect(dialog).toBeVisible();
  });
});

test.describe('the press model', () => {
  test('a press on the row, dragged into the flyout and released on a row, picks it', async ({
    page,
  }) => {
    await mount(page);
    await page.getByRole('button', {name: 'Session'}).click();
    const row = page.getByRole('menuitem', {name: 'Labels'});
    await row.hover();
    const dialog = page.getByRole('dialog', {name: 'Labels'});
    await expect(dialog).toBeVisible();
    const feature = dialog.getByRole('menuitemcheckbox', {name: 'Feature'});
    const [from, to] = await Promise.all([row, feature].map(bounds));
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width - 4, from.y + from.height / 2, {
      steps: 4,
    });
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
      steps: 8,
    });
    await page.mouse.up();
    await expect(page.getByTestId('picked')).toHaveText('Bug, Feature');
    // A checkbox pick keeps the sub-menu, and the menu, open.
    await expect(dialog).toBeVisible();
  });
});

test.describe('on a phone (coarse pointer)', () => {
  const {defaultBrowserType: _browser, ...phone} = devices['Pixel 7'];
  test.use(phone);

  test('the drilled-in view holds field, rows and button beside the root menu, which steps aside', async ({
    page,
  }) => {
    await mount(page);
    const trigger = page.getByRole('button', {name: 'Session'});
    await trigger.tap();
    const rootMenu = page.getByRole('menu', {name: 'Session'});
    await expect(rootMenu).toBeVisible();
    await page.getByRole('menuitem', {name: 'Labels'}).tap();

    const dialog = page.getByRole('dialog', {name: 'Labels'});
    await expect(dialog).toBeVisible();
    await expect(rootMenu).toBeHidden();
    expect(await isInsideAMenu(page, 'Labels')).toBe(false);
    // Same popover: the view replaces the root's rows in place.
    expect(
      await dialog.evaluate(
        el =>
          el.closest('[popover]') ===
          document
            .querySelector('[role="menu"][aria-label="Session"]')
            ?.closest('[popover]'),
      ),
    ).toBe(true);
    await expect(
      dialog.getByRole('menuitem', {name: 'Back to Session'}),
    ).toBeVisible();
    await expect(
      dialog.getByRole('textbox', {name: 'Filter labels'}),
    ).toBeVisible();
    await expect(
      dialog.getByRole('button', {name: 'Create label'}),
    ).toBeVisible();

    await dialog.getByRole('menuitem', {name: 'Back to Session'}).tap();
    await expect(dialog).toBeHidden();
    await expect(rootMenu).toBeVisible();
  });
});

test.describe('a header with a choice', () => {
  test('a flyout the pointer has left stays open while an arrow moves the choice in its header', async ({
    page,
  }) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=core-dropdownmenu--sub-menu-header-choice&viewMode=story`,
    );
    await expect(page.getByTestId('submenu-choice-fixture')).toBeVisible();
    await page.getByRole('button', {name: 'Filters'}).click();
    const row = page.getByRole('menuitem', {name: 'Labels'});
    await row.hover();
    const dialog = page.getByRole('dialog', {name: 'Labels'});
    await expect(dialog).toBeVisible();
    const anyLabel = dialog.getByRole('radio', {name: 'Any label'});
    const allLabels = dialog.getByRole('radio', {name: 'All labels'});
    await anyLabel.click();
    await expect(anyLabel).toBeFocused();

    // The pointer leaves the flyout and the menu, and its hide delay runs out
    // with focus still inside.
    const viewport = page.viewportSize() ?? {width: 1280, height: 720};
    await page.mouse.move(viewport.width - 8, viewport.height - 8, {steps: 4});
    await page.waitForTimeout(500);
    await expect(dialog).toBeVisible();

    // The browser moves focus and the choice for the arrow itself.
    await page.keyboard.press('ArrowDown');
    await expect(allLabels).toBeFocused();
    await expect(allLabels).toBeChecked();
    await expect(page.getByTestId('match')).toHaveText('all');
    await expect(dialog).toBeVisible();
  });
});
