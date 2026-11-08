// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope core/Layer core/Dialog core/Drawer core/CommandPalette core/DropdownMenu core/Typeahead core/DateInput core/InfoTip core/Tooltip core/ContextMenu ^apps/storybook/stories/BackdropPressA11y

/**
 * @file BackdropPress.a11y.chromium.spec.ts
 * @input The built A11y/BackdropPress story; real Chromium mouse and touch
 *   input
 * @output Browser evidence that a press which crosses the edge of a Dialog,
 *   Drawer or CommandPalette, either way, leaves it open, that a press on the
 *   backdrop alone still dismisses it, and that a backdrop press which closes
 *   a layer open inside a Dialog or Drawer (a menu, a Typeahead list, a
 *   DateInput calendar, a pinned InfoTip, a ContextMenu) leaves the host open
 * @position Chromium proof for the shared backdrop-press rule
 *   (Layer/useBackdropPress.ts). jsdom has no backdrop hit testing and no
 *   click retargeting to the common ancestor.
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
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

// FR11: a press that closes only the layer leaves focus inside the host.
async function expectFocusInside(surface: Locator) {
  expect(
    await surface.evaluate(
      element =>
        element === document.activeElement ||
        element.contains(document.activeElement),
    ),
  ).toBe(true);
}

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

for (const {name, open, dialog} of MEMBERS.filter(
  member => member.name !== 'CommandPalette',
)) {
  test.describe(`${name} with a menu open inside`, () => {
    async function openMenu(page: Page) {
      const surface = await openMember(page, open, dialog);
      await surface.getByRole('button', {name: 'Actions'}).click();
      const menu = page.getByRole('menu');
      await expect(menu).toBeVisible();
      return {surface, menu};
    }

    test('a mouse press on the backdrop closes only the menu, and the next closes the host', async ({
      page,
    }) => {
      const {surface, menu} = await openMenu(page);
      await page.mouse.click(BACKDROP.x, BACKDROP.y);
      await expect(menu).toBeHidden();
      await expect(surface).toBeVisible();
      await expectFocusInside(surface);
      await page.mouse.click(BACKDROP.x, BACKDROP.y);
      await expect(surface).toBeHidden();
    });

    test('a finger tap on the backdrop closes only the menu, and the next closes the host', async ({
      page,
    }) => {
      const {surface, menu} = await openMenu(page);
      await page.touchscreen.tap(BACKDROP.x, BACKDROP.y);
      await expect(menu).toBeHidden();
      await expect(surface).toBeVisible();
      await expectFocusInside(surface);
      await page.touchscreen.tap(BACKDROP.x, BACKDROP.y);
      await expect(surface).toBeHidden();
    });
  });
}

test.describe('Dialog with another layer open inside, with a mouse', () => {
  async function openLayersDialog(page: Page) {
    await page.goto(
      `${storybook.origin}/iframe.html?id=a11y-backdroppress--layers-in-dialog&viewMode=story`,
    );
    await holdMotionStill(page);
    await page.getByRole('button', {name: 'Open layers dialog'}).click();
    const surface = page.getByRole('dialog', {name: 'Layers dialog'});
    await expect(surface).toBeVisible();
    return surface;
  }

  const LAYERS = [
    {
      name: 'a Typeahead list',
      open: async (page: Page) => {
        await page.getByRole('combobox', {name: 'Fruit'}).fill('ap');
        return page.getByRole('listbox');
      },
    },
    {
      name: 'a DateInput calendar',
      open: async (page: Page) => {
        await page.getByRole('button', {name: 'Open calendar'}).click();
        return page.getByRole('grid').first();
      },
    },
    {
      name: 'a pinned InfoTip',
      open: async (page: Page) => {
        await page.getByRole('button', {name: 'About layers'}).click();
        return page.getByRole('tooltip');
      },
    },
    {
      name: 'a ContextMenu',
      open: async (page: Page) => {
        await page.getByText('Right-click here').click({button: 'right'});
        return page.getByRole('menu');
      },
    },
  ];

  for (const {name, open} of LAYERS) {
    test(`a backdrop click closes only ${name}, and the next closes the dialog`, async ({
      page,
    }) => {
      const surface = await openLayersDialog(page);
      const layer = await open(page);
      await expect(layer).toBeVisible();
      await page.mouse.click(BACKDROP.x, BACKDROP.y);
      await expect(layer).toBeHidden();
      await expect(surface).toBeVisible();
      await expectFocusInside(surface);
      await page.mouse.click(BACKDROP.x, BACKDROP.y);
      await expect(surface).toBeHidden();
    });
  }
});
