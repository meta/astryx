// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DropdownMenuSheetRowPress.interaction.browser.spec.ts
 * @input The built bottom-sheet DropdownMenu stories, real touch input
 *   (Chromium CDP / WebKit's input command) and a real mouse
 * @output Proof that a press on a sheet row outside its action (its icon, its
 *   padding, a submenu row's chevron) runs the row, as a press on its label
 *   does, for a finger and for a mouse. A press on a section heading runs no
 *   row and leaves the sheet open. A tap or a click on a switch or a checkbox
 *   in a row's end content toggles it once and runs no row. A drag of a
 *   switch's thumb past its flip and back changes nothing.
 * @position Evidence for MenuBottomSheetActionList's whole-row press; the
 *   row lookup itself is unit-tested in MenuBottomSheetActionList.test.tsx
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  drag,
  openStory,
  touchDriver,
  withStorybook,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

const ACTION_SHEET = 'core-dropdownmenu--action-sheet-presentation';
const DRILL_IN = 'core-dropdownmenu--compact-drill-in-presentation';
const SECTIONED = 'core-dropdownmenu--sectioned-action-sheet-presentation';
const END_CONTROLS = 'core-dropdownmenu--action-sheet-end-content-controls';

interface Point {
  x: number;
  y: number;
}

/**
 * Opens a story whose play function opens the sheet, and waits until the
 * sheet is shown and its entrance has ended. Returns the rows it logs as
 * picked ("<label> selected").
 */
async function openSheet(page: Page, story: string): Promise<string[]> {
  const picked: string[] = [];
  page.on('console', message => {
    const text = message.text();
    if (text.endsWith(' selected')) {
      picked.push(text.replace(/ selected$/, ''));
    }
  });
  await openStory(page, storybook(), story);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect
    .poll(async () => page.evaluate(() => document.getAnimations().length))
    .toBe(0);
  return picked;
}

/** The row around the action named `label`: its nearest list item. */
function sheetRow(page: Page, label: string): Locator {
  return page
    .getByRole('dialog')
    .getByRole('button', {name: label})
    .locator('xpath=ancestor::li[1]');
}

/**
 * The point at the middle of `locator`, checked to be outside every action
 * of its row: the page's own hit test there finds no button and no link.
 * So a press there is the press this spec is about, not one on the label.
 */
async function pointOutsideAction(
  locator: Locator,
  at: 'center' | 'start-padding',
): Promise<Point> {
  const box = await locator.boundingBox();
  if (box == null) {
    throw new Error('the element has no rendered box');
  }
  const point = {
    x: at === 'center' ? box.x + box.width / 2 : box.x + 3,
    y: box.y + box.height / 2,
  };
  const hit = await locator.page().evaluate(({x, y}) => {
    const element = document.elementFromPoint(x, y);
    return {
      tag: element?.tagName.toLowerCase() ?? null,
      inAction: element?.closest('button, a[href]') != null,
      inRow: element?.closest('li') != null,
    };
  }, point);
  expect(hit.tag).not.toBeNull();
  expect(hit.inRow).toBe(true);
  expect(hit.inAction).toBe(false);
  return point;
}

const SPOTS = [
  {
    name: 'icon',
    spot: (row: Locator) => row.locator('svg').first(),
    at: 'center',
  },
  {name: 'start padding', spot: (row: Locator) => row, at: 'start-padding'},
] as const;

test.describe('a finger on a sheet row', () => {
  for (const {name, spot, at} of SPOTS) {
    test(`a tap on the row's ${name} runs the row and closes the sheet`, async ({
      page,
    }) => {
      const picked = await openSheet(page, ACTION_SHEET);
      const driver = await touchDriver(page);
      const row = sheetRow(page, 'Duplicate project');
      await driver.tap(await pointOutsideAction(spot(row), at));

      await expect(page.getByRole('dialog')).toBeHidden();
      expect(picked).toEqual(['Duplicate project']);
    });
  }

  test("a tap on a submenu row's chevron opens the submenu", async ({page}) => {
    await openSheet(page, DRILL_IN);
    const driver = await touchDriver(page);
    const chevron = sheetRow(page, 'Move to project').locator('svg').last();
    await driver.tap(await pointOutsideAction(chevron, 'center'));

    await expect(
      page.getByRole('dialog').getByText('Apollo launch', {exact: true}),
    ).toBeVisible();
  });

  test('a tap on a section heading runs no row and leaves the sheet open', async ({
    page,
  }) => {
    await openSheet(page, SECTIONED);
    const driver = await touchDriver(page);
    const heading = page.getByRole('dialog').getByRole('heading', {
      name: 'Create',
    });
    await driver.tap(await pointOutsideAction(heading, 'center'));
    // Two frames and a pause longer than the sheet's exit would take to
    // start: a row that ran would have begun to close it.
    await page.waitForTimeout(500);
    await expect(page.getByRole('dialog')).toBeVisible();

    // A row in the section still runs from its padding.
    await driver.tap(
      await pointOutsideAction(sheetRow(page, 'New file'), 'start-padding'),
    );
    await expect(page.getByRole('dialog')).toBeHidden();
  });
});

test.describe('a mouse on a sheet row', () => {
  for (const {name, spot, at} of SPOTS) {
    test(`a click on the row's ${name} runs the row and closes the sheet`, async ({
      page,
    }) => {
      const picked = await openSheet(page, ACTION_SHEET);
      const row = sheetRow(page, 'Duplicate project');
      const {x, y} = await pointOutsideAction(spot(row), at);
      await page.mouse.click(x, y);

      await expect(page.getByRole('dialog')).toBeHidden();
      expect(picked).toEqual(['Duplicate project']);
    });
  }
});

/** The end-content controls of END_CONTROLS, by accessible role and name. */
const END_CONTROLS_CASES = [
  {kind: 'Switch', role: 'switch', name: 'Pinned'},
  {kind: 'CheckboxInput', role: 'checkbox', name: 'Starred'},
  {kind: 'a native checkbox', role: 'checkbox', name: 'Archived'},
] as const;

/** The middle of `locator`'s box: where a person aims at the control. */
async function controlCenter(locator: Locator): Promise<Point> {
  const box = await locator.boundingBox();
  if (box == null) {
    throw new Error('the control has no rendered box');
  }
  return {x: box.x + box.width / 2, y: box.y + box.height / 2};
}

/**
 * Waits past every late activation a control could make: a switch that has
 * no browser click clicks its input once the click window passes.
 */
async function waitPastLateClicks(page: Page): Promise<void> {
  await page.waitForTimeout(800);
}

test.describe("a control in a sheet row's end content", () => {
  for (const {kind, role, name} of END_CONTROLS_CASES) {
    test(`a tap on ${kind} toggles it once and runs no row`, async ({page}) => {
      const picked = await openSheet(page, END_CONTROLS);
      const driver = await touchDriver(page);
      const control = page.getByRole('dialog').getByRole(role, {name});
      await expect(control).not.toBeChecked();

      await driver.tap(await controlCenter(control));
      await waitPastLateClicks(page);

      await expect(control).toBeChecked();
      await expect(page.getByRole('dialog')).toBeVisible();
      expect(picked).toEqual([]);
    });

    test(`a click on ${kind} toggles it once and runs no row`, async ({
      page,
    }) => {
      const picked = await openSheet(page, END_CONTROLS);
      const control = page.getByRole('dialog').getByRole(role, {name});
      const {x, y} = await controlCenter(control);
      await page.mouse.click(x, y);
      await waitPastLateClicks(page);

      await expect(control).toBeChecked();
      await expect(page.getByRole('dialog')).toBeVisible();
      expect(picked).toEqual([]);
    });
  }

  /**
   * Counts the switch's changes: a drag that toggles it on and back off
   * ends unchecked, as a drag that changes nothing does.
   */
  async function countChanges(
    control: Locator,
  ): Promise<() => Promise<number>> {
    await control.evaluate(input => {
      const counted = input as HTMLInputElement & {changes?: number};
      counted.changes = 0;
      input.addEventListener('change', () => {
        counted.changes = (counted.changes ?? 0) + 1;
      });
    });
    return async () =>
      control.evaluate(
        input => (input as HTMLInputElement & {changes?: number}).changes ?? 0,
      );
  }

  test('a finger that drags the switch past its flip and back changes nothing', async ({
    page,
  }) => {
    const picked = await openSheet(page, END_CONTROLS);
    const driver = await touchDriver(page);
    const control = page
      .getByRole('dialog')
      .getByRole('switch', {name: 'Pinned'});
    const changes = await countChanges(control);
    const box = (await control.boundingBox())!;
    const start = {x: box.x + 8, y: box.y + box.height / 2};
    const out = {x: box.x + box.width + 12, y: start.y};
    await driver.play([
      ...drag(start, out, {durationMs: 400, holdMs: 300}).slice(0, -1),
      ...drag(out, {x: start.x - 4, y: start.y}, {durationMs: 400, restMs: 200})
        .slice(1)
        .map(frame => ({...frame, t: frame.t + 700})),
    ]);
    await waitPastLateClicks(page);

    await expect(control).not.toBeChecked();
    expect(await changes()).toBe(0);
    expect(picked).toEqual([]);
  });

  test('a mouse that drags the switch past its flip and back changes nothing', async ({
    page,
  }) => {
    const picked = await openSheet(page, END_CONTROLS);
    const control = page
      .getByRole('dialog')
      .getByRole('switch', {name: 'Pinned'});
    const changes = await countChanges(control);
    const box = (await control.boundingBox())!;
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + 8, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width + 12, y, {steps: 12});
    await page.mouse.move(box.x + 4, y, {steps: 12});
    await page.mouse.up();
    await waitPastLateClicks(page);

    await expect(control).not.toBeChecked();
    expect(await changes()).toBe(0);
    expect(picked).toEqual([]);
  });
});
