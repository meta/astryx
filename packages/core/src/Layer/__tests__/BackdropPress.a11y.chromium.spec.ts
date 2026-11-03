// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope core/Layer core/Dialog core/Drawer core/CommandPalette ^apps/storybook/stories/BackdropPressA11y

/**
 * @file BackdropPress.a11y.chromium.spec.ts
 * @input The built A11y/BackdropPress story; real Chromium mouse and touch
 *   input
 * @output Browser evidence that a press which crosses the edge of a Dialog,
 *   Drawer or CommandPalette, either way, leaves it open, and that a
 *   press on the backdrop alone still dismisses it
 * @position Chromium proof for the shared backdrop-press rule
 *   (Layer/useBackdropPress.ts). jsdom has no backdrop hit testing and no
 *   click retargeting to the common ancestor.
 */

import {expect, test, type Page} from '@playwright/test';
import {holdMotionStill} from '@astryxdesign/a11y-spec/chromium';
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

test.use({viewport: {width: 1024, height: 768}, hasTouch: true});

const MEMBERS = [
  {name: 'Dialog', open: 'Open dialog', dialog: 'Note dialog', field: 'Note'},
  {name: 'Drawer', open: 'Open drawer', dialog: 'Note drawer', field: 'Note'},
  {
    name: 'CommandPalette',
    open: 'Open palette',
    dialog: 'Commands',
    field: null,
  },
] as const;

// A backdrop point clear of every member: Dialog and CommandPalette sit in the
// middle, the Drawer at the end edge.
const BACKDROP = {x: 12, y: 12};

async function openMember(page: Page, open: string, dialog: string) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=a11y-backdroppress--members&viewMode=story`,
  );
  await holdMotionStill(page);
  await page.getByRole('button', {name: open, exact: true}).click();
  const surface = page.getByRole('dialog', {name: dialog});
  await expect(surface).toBeVisible();
  return surface;
}

async function insidePoint(page: Page, dialog: string, field: string | null) {
  const surface = page.getByRole('dialog', {name: dialog});
  const target =
    field == null
      ? surface.getByRole('combobox').first()
      : surface.getByRole('textbox', {name: field});
  const box = await target.boundingBox();
  if (box == null) {
    throw new Error(`${dialog} has no field box`);
  }
  return {x: box.x + 8, y: box.y + box.height / 2};
}

for (const {name, open, dialog, field} of MEMBERS) {
  test.describe(name, () => {
    test('a mouse press that starts inside and ends on the backdrop leaves it open', async ({
      page,
    }) => {
      const surface = await openMember(page, open, dialog);
      const inside = await insidePoint(page, dialog, field);
      // The click this produces goes to the common ancestor, the <dialog>.
      await page.mouse.move(inside.x, inside.y);
      await page.mouse.down();
      await page.mouse.move(BACKDROP.x, BACKDROP.y, {steps: 8});
      await page.mouse.up();
      await expect(surface).toBeVisible();
    });

    test('a mouse press that starts on the backdrop and ends inside leaves it open', async ({
      page,
    }) => {
      const surface = await openMember(page, open, dialog);
      const inside = await insidePoint(page, dialog, field);
      await page.mouse.move(BACKDROP.x, BACKDROP.y);
      await page.mouse.down();
      await page.mouse.move(inside.x, inside.y, {steps: 8});
      await page.mouse.up();
      await expect(surface).toBeVisible();
    });

    test('a mouse press on the backdrop alone dismisses it', async ({page}) => {
      const surface = await openMember(page, open, dialog);
      await page.mouse.click(BACKDROP.x, BACKDROP.y);
      await expect(surface).toBeHidden();
    });

    test('a finger tap on the backdrop dismisses it', async ({page}) => {
      const surface = await openMember(page, open, dialog);
      await page.touchscreen.tap(BACKDROP.x, BACKDROP.y);
      await expect(surface).toBeHidden();
    });
  });
}
