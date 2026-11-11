// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file LayerSamePress.interaction.browser.spec.ts
 * @input The "Core/Layer Same Press" story in real Chromium, through the
 *   interaction harness
 * @output Browser evidence that a press whose release opens a layer does
 *   not close it: a DropdownMenu row opening a Popover and a BottomSheet,
 *   a ContextMenu row opening a Popover, and a row in an open Popover
 *   opening a nested Popover, under a mouse and a finger (whose touchend
 *   the menu cancels, so no click comes). The layer's next outside press
 *   and Escape still close it
 * @position Verification for Layer/useLayer.tsx's show during a release
 *   and Layer/gestureCounter.ts
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {openStory, withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);
const STORY = 'core-layer-same-press--menu-row-opens-layer';

/** A mouse click held as a person holds one: a hover, then 90 ms down. */
async function heldClick(page: Page, target: Locator): Promise<void> {
  const box = await target.boundingBox();
  if (box == null) {
    throw new Error('no box');
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(60);
  await page.mouse.down();
  await page.waitForTimeout(90);
  await page.mouse.up();
}

const dialog = (page: Page, name: string) =>
  page.getByRole('dialog', {name, exact: true});

for (const pointer of ['mouse', 'finger'] as const) {
  test.describe(`with a ${pointer}`, () => {
    test.use(
      pointer === 'mouse'
        ? {
            hasTouch: false,
            isMobile: false,
            viewport: {width: 900, height: 900},
          }
        : {hasTouch: true, isMobile: true, viewport: {width: 390, height: 844}},
    );

    /**
     * A held click with the mouse (a hover, then 90 ms down, as a person
     * clicks), or a tap with a finger.
     */
    const press = async (page: Page, target: Locator) => {
      if (pointer === 'mouse') {
        await heldClick(page, target);
      } else {
        await target.tap();
      }
    };

    test('a menu row that opens a Popover leaves it open, and the next outside press closes it', async ({
      page,
    }) => {
      await openStory(page, storybook(), STORY);
      await press(page, page.getByRole('button', {name: 'Actions'}));
      await press(page, page.getByRole('menuitem', {name: 'Open popover'}));
      await page.waitForTimeout(400);
      await expect(dialog(page, 'Item popover')).toBeVisible();
      await press(page, page.getByTestId('outside'));
      await expect(dialog(page, 'Item popover')).toBeHidden();
    });

    test('a menu row that opens a Popover leaves it open, and Escape closes it', async ({
      page,
    }) => {
      await openStory(page, storybook(), STORY);
      await press(page, page.getByRole('button', {name: 'Actions'}));
      await press(page, page.getByRole('menuitem', {name: 'Open popover'}));
      await page.waitForTimeout(400);
      await expect(dialog(page, 'Item popover')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialog(page, 'Item popover')).toBeHidden();
    });

    test('a menu row that opens a BottomSheet leaves it open', async ({
      page,
    }) => {
      await openStory(page, storybook(), STORY);
      await press(page, page.getByRole('button', {name: 'Actions'}));
      await press(page, page.getByRole('menuitem', {name: 'Open sheet'}));
      await page.waitForTimeout(600);
      await expect(dialog(page, 'Item sheet')).toBeVisible();
    });

    test('a row in an open Popover that opens a nested Popover leaves both open, and a press in the child keeps the parent', async ({
      page,
    }) => {
      await openStory(page, storybook(), STORY);
      await press(page, page.getByRole('button', {name: 'Open parent'}));
      await expect(dialog(page, 'Parent popover')).toBeVisible();
      await press(page, page.getByRole('button', {name: 'Child actions'}));
      await press(page, page.getByRole('menuitem', {name: 'Open child'}));
      await page.waitForTimeout(400);
      await expect(dialog(page, 'Child popover')).toBeVisible();
      await expect(dialog(page, 'Parent popover')).toBeVisible();
      await press(
        page,
        page.getByRole('button', {name: 'Inside child popover'}),
      );
      await expect(dialog(page, 'Parent popover')).toBeVisible();
    });
  });
}

test.describe('with a mouse, a context menu', () => {
  test.use({
    hasTouch: false,
    isMobile: false,
    viewport: {width: 900, height: 900},
  });

  test('a ContextMenu row that opens a Popover leaves it open', async ({
    page,
  }) => {
    await openStory(page, storybook(), STORY);
    await page.getByTestId('context-region').click({button: 'right'});
    await heldClick(
      page,
      page.getByRole('menuitem', {name: 'Open context popover'}),
    );
    await page.waitForTimeout(400);
    await expect(dialog(page, 'Context popover')).toBeVisible();
  });
});
