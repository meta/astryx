// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file DropdownMenuDrillIn.a11y.chromium.spec.ts
 * @input Built Storybook adaptive sub-menu fixture and real Chromium, once
 *   emulating a phone (coarse pointer, touch) and once a laptop (fine pointer)
 * @output Evidence for component:DropdownMenu FR12 / AR3: on a coarse pointer
 *   an adaptive sub-menu drills in — the rows are replaced in the same menu
 *   box, the drilled list is named by its row, Back / Escape return focus to
 *   the row — and on a fine pointer the same sub-menu flies out.
 * @position Browser proof behind the jsdom drill-in suite; the pointer decision
 *   (`(pointer: coarse)` at open time) is what jsdom cannot exercise.
 */

import {devices, expect, test, type Page} from '@playwright/test';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

let storybook: StaticServer;
const storyId = 'core-dropdownmenu--submenu-adaptive-fixture';

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
  await expect(page.getByTestId('drill-in-fixture')).toBeVisible();
}

/** The rows a person can see: not under a hidden wrapper, not in a closed popover. */
function shownRows(page: Page) {
  return page.locator('[role="menuitem"]:visible');
}

test.describe('on a phone (coarse pointer)', () => {
  // The phone's context options only: `defaultBrowserType` would force a new
  // worker, which a describe-level `use` may not do.
  const {defaultBrowserType: _browser, ...phone} = devices['Pixel 7'];
  test.use(phone);

  test('an adaptive sub-menu drills in, is named by its row, and Back / Escape return to the row', async ({
    page,
  }) => {
    await mount(page);
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(true);

    const trigger = page.getByRole('button', {name: 'Actions'});
    await trigger.tap();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const rootMenu = page.getByRole('menu', {name: 'Actions'});
    await expect(rootMenu).toBeVisible();
    await expect(shownRows(page)).toHaveText(['Rename', 'Move to', 'Delete']);
    const popoversBefore = await page.locator('[popover]:popover-open').count();

    // Drill in with a finger.
    const moveTo = page.getByRole('menuitem', {name: 'Move to'});
    await expect(moveTo).toHaveAttribute('aria-haspopup', 'menu');
    await moveTo.tap();

    const drilled = page.getByRole('menu', {name: 'Move to'});
    await expect(drilled).toBeVisible();
    // Same box: the drilled list sits inside the root menu, no new popover.
    expect(
      await drilled.evaluate(
        (el, rootName) =>
          el.closest('[popover]') ===
          document
            .querySelector(`[role="menu"][aria-label="${rootName}"]`)
            ?.closest('[popover]'),
        'Actions',
      ),
    ).toBe(true);
    expect(await page.locator('[popover]:popover-open').count()).toBe(
      popoversBefore,
    );
    await expect(shownRows(page)).toHaveText([
      'Back to Actions',
      'Folder A',
      'Folder B',
      'Archive',
    ]);
    await expect(page.getByRole('menuitem', {name: 'Rename'})).toBeHidden();
    // The parent rows have left the accessibility tree while the view shows.
    expect(
      await page.evaluate(
        () =>
          document
            .querySelector('[role="menuitem"][aria-haspopup="menu"]')
            ?.closest('[hidden]') instanceof HTMLElement,
      ),
    ).toBe(true);

    // A pointer drill-in lights nothing; the drilled list owns focus.
    expect(
      await page.evaluate(() => document.activeElement?.getAttribute('role')),
    ).toBe('menu');

    // Escape pops one level and lands on the row; the menu stays open.
    await page.keyboard.press('Escape');
    await expect(moveTo).toBeFocused();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(shownRows(page)).toHaveText(['Rename', 'Move to', 'Delete']);

    // Keyboard drill-in lands on the first row after Back; a second level
    // names its parent; ArrowLeft pops it.
    await page.keyboard.press('Enter');
    await expect(drilled).toBeVisible();
    await expect(page.getByRole('menuitem', {name: 'Folder A'})).toBeFocused();
    await page.getByRole('menuitem', {name: 'Archive'}).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu', {name: 'Archive'})).toBeVisible();
    await expect(shownRows(page)).toHaveText(['Back to Move to', '2025']);
    await expect(page.getByRole('menuitem', {name: '2025'})).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('menuitem', {name: 'Archive'})).toBeFocused();
    await expect(shownRows(page)).toHaveText([
      'Back to Actions',
      'Folder A',
      'Folder B',
      'Archive',
    ]);

    // Back returns to the row with a finger too.
    await page.getByRole('menuitem', {name: 'Back to Actions'}).tap();
    await expect(moveTo).toBeFocused();
    await expect(shownRows(page)).toHaveText(['Rename', 'Move to', 'Delete']);

    // A pick inside a drilled view closes the whole menu.
    await moveTo.tap();
    await page.getByRole('menuitem', {name: 'Folder A'}).tap();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});

test.describe('on a laptop (fine pointer)', () => {
  test('the same adaptive sub-menu flies out beside its row', async ({
    page,
  }) => {
    await mount(page);
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(false);

    const trigger = page.getByRole('button', {name: 'Actions'});
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const popoversBefore = await page.locator('[popover]:popover-open').count();

    const moveTo = page.getByRole('menuitem', {name: 'Move to'});
    await moveTo.click();
    const flyout = page.getByRole('menu', {name: 'Move to'});
    await expect(flyout).toBeVisible();
    // A popover of its own, beside the row; the parent rows stay shown.
    expect(await page.locator('[popover]:popover-open').count()).toBe(
      popoversBefore + 1,
    );
    await expect(page.getByRole('menuitem', {name: 'Rename'})).toBeVisible();
    await expect(page.getByRole('menuitem', {name: /^Back to/})).toHaveCount(0);
    await expect(page.getByRole('menuitem', {name: 'Folder A'})).toBeFocused();
  });
});
