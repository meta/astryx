// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file LayerPanLightDismiss.interaction.browser.spec.ts
 * @input The built Popover, Selector, DropdownMenu, ContextMenu and other
 *   menu stories under the harness's phone profile, with real touch input in
 *   Chromium (CDP)
 * @output Proof that a touch that pans over the page does not light-dismiss
 *   an open Popover or Selector list, with and without pointercancel. That
 *   includes a pan that the browser itself reads as a tap. A tap outside
 *   still closes the layer, also after a pan. The menus keep their own
 *   outside behavior
 * @position Evidence for `architecture:layer-runtime` INV7 (native light
 *   dismiss identifies gestures); the watch and the claim are unit-tested in
 *   outsidePress.test.ts and gestureCounter.test.ts
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  drag,
  frames,
  openStory,
  touchDriver,
  waitForRest,
  withStorybook,
  type Point,
  type TouchDriver,
} from '@astryxdesign/interaction-harness';
import {UIKIT_PAN} from '../../motion/uikit/gestures';

const storybook = withStorybook(test);

const PAN_PX = UIKIT_PAN.hysteresis.value;

const TAP_AFTER_PAN_MS = 500;

interface Surface {
  readonly name: string;
  readonly story: string;
  readonly role: 'button' | 'combobox';
  readonly trigger: string;
}

const SURFACES: ReadonlyArray<Surface> = [
  {
    name: 'Popover',
    story: 'core-popover--default',
    role: 'button',
    trigger: 'Settings',
  },
  {
    name: 'Selector',
    story: 'core-selector--default',
    role: 'combobox',
    trigger: 'Fruit',
  },
];

const DROPDOWN_MENU: Surface = {
  name: 'DropdownMenu',
  story: 'core-dropdownmenu--default',
  role: 'button',
  trigger: 'Actions',
};

interface PressLog {
  readonly types: string[];
  readonly down: Point | null;
  readonly up: Point | null;
}

/** Makes the document scroll, and logs every press. */
async function preparePage(page: Page) {
  await page.evaluate(() => {
    // Out of flow, so the story keeps its layout.
    const spacer = document.createElement('div');
    spacer.style.cssText =
      'position:absolute;inset-block-start:0;inset-inline-start:0;inline-size:1px;block-size:200vh';
    document.body.append(spacer);
    const log = {
      types: [] as string[],
      down: null as unknown,
      up: null as unknown,
    };
    (window as unknown as {__press: typeof log}).__press = log;
    for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'click']) {
      addEventListener(
        type,
        event => {
          const {clientX: x, clientY: y} = event as PointerEvent;
          if (type === 'pointerdown') {
            log.types = [];
            log.down = {x, y};
            log.up = null;
          }
          if (type === 'pointerup') {
            log.up = {x, y};
          }
          log.types.push(type);
        },
        true,
      );
    }
  });
}

const readPress = async (page: Page): Promise<PressLog> =>
  page.evaluate(() => (window as unknown as {__press: PressLog}).__press);

async function isLayerOpen(page: Page): Promise<boolean> {
  return (await page.locator('[popover="auto"]:popover-open').count()) > 0;
}

/** Opens the surface with a tap on its trigger and waits for it to settle. */
async function openSurface(
  page: Page,
  surface: Surface,
): Promise<{driver: TouchDriver; outside: Point}> {
  await openStory(page, storybook(), surface.story);
  await preparePage(page);
  const driver = await touchDriver(page);
  const trigger = page.getByRole(surface.role, {name: surface.trigger});
  const box = await trigger.boundingBox();
  if (box == null) {
    throw new Error('the trigger has no rendered box');
  }
  await driver.tap({x: box.x + box.width / 2, y: box.y + box.height / 2});
  const layer = page.locator('[popover="auto"]:popover-open').first();
  await expect(layer).toBeVisible();
  await waitForRest(layer);
  const layerBox = await layer.boundingBox();
  const viewport = page.viewportSize();
  if (layerBox == null || viewport == null) {
    throw new Error('the layer or the viewport has no size');
  }
  // A point on the page beside the layer.
  const outside = {x: 10, y: Math.round(viewport.height - 200)};
  expect(
    outside.x < layerBox.x || outside.y > layerBox.y + layerBox.height,
    'the page point is outside the layer',
  ).toBe(true);
  return {driver, outside};
}

/**
 * A 40 px pan that starts while the main thread is busy for 400 ms. The
 * browser then takes no scroll and sends no pointercancel: the page sees the
 * press, its moves and its lift once the main thread is free.
 */
async function panWhileBusy(page: Page, from: Point) {
  const cdp = await page.context().newCDPSession(page);
  await page.evaluate(() => {
    setTimeout(() => {
      const end = performance.now() + 400;
      while (performance.now() < end) {
        // Holds the main thread.
      }
    }, 0);
  });
  await page.waitForTimeout(30);
  let at = Date.now() / 1000;
  const send = async (
    type: 'touchStart' | 'touchMove' | 'touchEnd',
    touchPoints: Point[],
    step: number,
  ) => {
    at += step;
    return cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints,
      timestamp: at,
    });
  };
  await Promise.all([
    send('touchStart', [from], 0),
    ...[1, 2, 3, 4].map(async index =>
      send('touchMove', [{x: from.x, y: from.y - 10 * index}], 0.016),
    ),
    send('touchEnd', [], 0.008),
  ]);
  await page.waitForTimeout(600);
  await cdp.detach();
}

async function pan(driver: TouchDriver, from: Point, to: Point, ms: number) {
  await driver.play(drag(from, to, {durationMs: ms}), {releaseUnread: true});
}

async function tapClosesLayer(page: Page, driver: TouchDriver, at: Point) {
  // Chromium makes no tap from a touch that starts about 100 ms after a pan
  // lifted, with or without a layer open.
  await page.waitForTimeout(TAP_AFTER_PAN_MS);
  await driver.tap(at);
  await expect
    .poll(async () => isLayerOpen(page), {
      message: 'a tap outside closes the layer',
      timeout: 2000,
    })
    .toBe(false);
  const press = await readPress(page);
  expect(press.types, 'the tap made a click').toContain('click');
}

for (const surface of SURFACES) {
  test.describe(surface.name, () => {
    test.beforeEach(({browserName}) => {
      test.skip(
        browserName !== 'chromium',
        'the browser reads a short pan as a tap only in Chromium, through CDP touch',
      );
    });

    test('a pan that the browser reads as a tap leaves it open', async ({
      page,
    }) => {
      const {driver, outside} = await openSurface(page, surface);
      // Past the pan distance, inside the browser's own tap distance: the
      // browser makes a tap, as it does for a fling when its main thread is
      // late.
      const travel = PAN_PX + 2;
      await pan(driver, outside, {x: outside.x, y: outside.y - travel}, 48);
      await frames(page, 3);
      const press = await readPress(page);
      expect(press.types, 'the page saw a lift and no cancel').toContain(
        'pointerup',
      );
      expect(press.types).not.toContain('pointercancel');
      expect(
        Math.abs((press.up?.y ?? 0) - (press.down?.y ?? 0)),
        'the touch travelled past the pan distance',
      ).toBeGreaterThanOrEqual(PAN_PX);
      expect(await isLayerOpen(page), 'the pan leaves the layer open').toBe(
        true,
      );
      expect(press.types, 'the pan makes no click').not.toContain('click');
      await tapClosesLayer(page, driver, outside);
    });

    test('a 40 px pan with no pointercancel leaves it open', async ({page}) => {
      const {driver, outside} = await openSurface(page, surface);
      await panWhileBusy(page, outside);
      const press = await readPress(page);
      expect(press.types, 'the page saw a lift and no cancel').toContain(
        'pointerup',
      );
      expect(press.types).not.toContain('pointercancel');
      expect(await isLayerOpen(page), 'the pan leaves the layer open').toBe(
        true,
      );
      await tapClosesLayer(page, driver, outside);
    });

    test('a 40 px pan that scrolls the page (pointercancel) leaves it open', async ({
      page,
    }) => {
      const {driver, outside} = await openSurface(page, surface);
      await pan(driver, outside, {x: outside.x, y: outside.y - 40}, 300);
      await frames(page, 3);
      const press = await readPress(page);
      expect(press.types, 'the browser took the pan').toContain(
        'pointercancel',
      );
      expect(await isLayerOpen(page), 'the pan leaves the layer open').toBe(
        true,
      );
      await tapClosesLayer(page, driver, outside);
    });

    test('a tap outside closes it', async ({page}) => {
      const {driver, outside} = await openSurface(page, surface);
      await tapClosesLayer(page, driver, outside);
    });
  });
}

// A page control that takes the touch keeps it: the layer does not claim a
// drag that a resize handle or a swipe row holds.
test.describe('page controls under an open Popover', () => {
  test.beforeEach(({browserName}) => {
    test.skip(
      browserName !== 'chromium',
      'the control drags are proven here through CDP touch in Chromium',
    );
  });

  test('a resize handle dragged by a finger follows it all the way', async ({
    page,
  }) => {
    await openSurface(page, {
      name: 'Popover over page controls',
      story: 'core-popover--over-page-controls',
      role: 'button',
      trigger: 'Settings',
    });
    const driver = await touchDriver(page);
    const handle = page.getByRole('separator', {name: 'Resize panel'});
    const box = await handle.boundingBox();
    const panel = page.getByRole('region', {name: 'Resizable panel'});
    const before = (await panel.boundingBox())?.width ?? 0;
    if (box == null) {
      throw new Error('the handle has no rendered box');
    }
    const start = {
      x: Math.round(box.x + box.width / 2),
      y: Math.round(box.y + box.height / 2),
    };
    await driver.play(
      drag(
        start,
        {x: start.x + 80, y: start.y},
        {durationMs: 400, restMs: 120},
      ),
      {releaseUnread: true},
    );
    await page.waitForTimeout(300);
    const after = (await panel.boundingBox())?.width ?? 0;
    expect(
      after - before,
      'the panel grows with the 80 px drag',
    ).toBeGreaterThanOrEqual(70);
  });

  test('a row swiped open follows the finger and rests open', async ({
    page,
  }) => {
    await openSurface(page, {
      name: 'Popover over page controls',
      story: 'core-popover--over-page-controls',
      role: 'button',
      trigger: 'Settings',
    });
    const driver = await touchDriver(page);
    const label = page.getByText('Message 3', {exact: true});
    const before = await label.boundingBox();
    const layerBox = await page
      .locator('[popover="auto"]:popover-open')
      .first()
      .boundingBox();
    if (before == null || layerBox == null) {
      throw new Error('the row or the layer has no rendered box');
    }
    const start = {
      x: Math.round(before.x + 200),
      y: Math.round(before.y + before.height / 2),
    };
    expect(
      start.y > layerBox.y + layerBox.height,
      'the swipe starts outside the layer',
    ).toBe(true);
    await driver.play(
      drag(
        start,
        {x: start.x - 120, y: start.y},
        {durationMs: 400, restMs: 120},
      ),
      {releaseUnread: true},
    );
    await page.waitForTimeout(800);
    const after = await label.boundingBox();
    expect(
      before.x - (after?.x ?? before.x),
      'the row rests open by at least half of a two-entry panel',
    ).toBeGreaterThanOrEqual(60);
  });
});

// An anchored menu owns what a pan outside it does: it closes as the pan
// begins. DropdownMenu does not do that yet, and the guard leaves it out.
test.describe('DropdownMenu', () => {
  test.beforeEach(({browserName}) => {
    test.skip(
      browserName !== 'chromium',
      'the browser reads a short pan as a tap only in Chromium, through CDP touch',
    );
  });

  test('a pan that the browser reads as a tap still closes it', async ({
    page,
  }) => {
    const {driver, outside} = await openSurface(page, DROPDOWN_MENU);
    await pan(driver, outside, {x: outside.x, y: outside.y - (PAN_PX + 2)}, 48);
    await expect
      .poll(async () => isLayerOpen(page), {
        message: 'the pan outside closes the menu',
        timeout: 2000,
      })
      .toBe(false);
  });

  test('a tap outside closes it', async ({page}) => {
    const {driver, outside} = await openSurface(page, DROPDOWN_MENU);
    await tapClosesLayer(page, driver, outside);
  });

  test.fixme('a pan that scrolls the page (pointercancel): closes as a pan outside begins (FR21 gap)', async ({
    page,
  }) => {
    const {driver, outside} = await openSurface(page, DROPDOWN_MENU);
    await pan(driver, outside, {x: outside.x, y: outside.y - 40}, 300);
    expect(await isLayerOpen(page)).toBe(false);
  });

  test.fixme('a 40 px pan with no pointercancel: closes as a pan outside begins (FR21 gap)', async ({
    page,
  }) => {
    const {outside} = await openSurface(page, DROPDOWN_MENU);
    await panWhileBusy(page, outside);
    expect(await isLayerOpen(page)).toBe(false);
  });
});

// Every other anchored layer with menu semantics owns its outside pan too.
const OTHER_MENUS: ReadonlyArray<Surface> = [
  {
    name: 'TabMenu',
    story: 'core-tablist--with-menu',
    role: 'button',
    trigger: 'More',
  },
  {
    name: 'BreadcrumbItem menu',
    story: 'core-breadcrumbs--menu-crumb',
    role: 'button',
    trigger: 'Teams',
  },
  {
    name: 'TopNavMenu',
    story: 'core-topnavmenu--default',
    role: 'button',
    trigger: 'Products',
  },
  {
    name: 'TopNavHeading menu',
    story: 'core-topnav--with-heading-menu',
    role: 'button',
    trigger: 'Acme Suite',
  },
  {
    name: 'SideNavHeading menu',
    story: 'core-sidenav--with-header-menu',
    role: 'button',
    trigger: 'Product Name',
  },
];

for (const menu of OTHER_MENUS) {
  test.describe(menu.name, () => {
    test.beforeEach(({browserName}) => {
      test.skip(
        browserName !== 'chromium',
        'the browser reads a short pan as a tap only in Chromium, through CDP touch',
      );
    });

    test('a pan that the browser reads as a tap still closes it', async ({
      page,
    }) => {
      const {driver, outside} = await openSurface(page, menu);
      await pan(
        driver,
        outside,
        {x: outside.x, y: outside.y - (PAN_PX + 2)},
        48,
      );
      await expect
        .poll(async () => isLayerOpen(page), {
          message: 'the pan outside closes the menu',
          timeout: 2000,
        })
        .toBe(false);
    });

    test.fixme('a pan outside: closes as a pan outside begins (FR21 gap)', async ({
      page,
    }) => {
      const {driver, outside} = await openSurface(page, menu);
      await pan(driver, outside, {x: outside.x, y: outside.y - 40}, 300);
      expect(await isLayerOpen(page)).toBe(false);
    });
  });
}

// ContextMenu is a manual popover with its own outside-press close, so the
// guard does not apply to it. These cases show that its outside behavior
// stays as it is.
test.describe('ContextMenu', () => {
  test.beforeEach(({browserName}) => {
    test.skip(
      browserName !== 'chromium',
      'the browser reads a short pan as a tap only in Chromium, through CDP touch',
    );
  });

  /** Opens the menu with a long press and finds a page point outside it. */
  async function openContextMenu(
    page: Page,
  ): Promise<{driver: TouchDriver; outside: Point}> {
    await openStory(page, storybook(), 'core-contextmenu--default');
    await preparePage(page);
    const driver = await touchDriver(page);
    const area = await page.getByText('Right-click this area').boundingBox();
    if (area == null) {
      throw new Error('the trigger area has no rendered box');
    }
    const held = await driver.press({
      x: area.x + area.width / 2,
      y: area.y + area.height / 2,
    });
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible({timeout: 3000});
    await held.lift();
    await page.waitForTimeout(TAP_AFTER_PAN_MS);
    await expect(menu, 'the long press leaves the menu open').toBeVisible();
    const menuBox = await menu.boundingBox();
    const viewport = page.viewportSize();
    if (menuBox == null || viewport == null) {
      throw new Error('the menu or the viewport has no size');
    }
    const isInside = (
      box: {x: number; y: number; width: number; height: number},
      {x, y}: Point,
    ) =>
      x >= box.x &&
      x <= box.x + box.width &&
      y >= box.y - PAN_PX &&
      y <= box.y + box.height + PAN_PX;
    const outside = [
      {x: 10, y: viewport.height - 200},
      {x: viewport.width - 10, y: viewport.height - 200},
      {x: 10, y: 120},
      {x: viewport.width - 10, y: 120},
    ].find(point => !isInside(menuBox, point) && !isInside(area, point));
    if (outside == null) {
      throw new Error('no page point lies outside the menu and its trigger');
    }
    return {driver, outside};
  }

  const menuCloses = async (page: Page) =>
    expect
      .poll(async () => page.getByRole('menu').isVisible(), {
        message: 'the pan outside closes the menu',
        timeout: 2000,
      })
      .toBe(false);

  test('a pan that the browser reads as a tap still closes it', async ({
    page,
  }) => {
    const {driver, outside} = await openContextMenu(page);
    await pan(driver, outside, {x: outside.x, y: outside.y - (PAN_PX + 2)}, 48);
    await menuCloses(page);
    const press = await readPress(page);
    expect(press.types).not.toContain('pointercancel');
  });

  test.fixme('a pan that scrolls the page (pointercancel) closes it (enabled by the ContextMenu pan-dismiss work)', async ({
    page,
  }) => {
    // ContextMenu FR5 lists this as an implementation gap: a scroll that
    // starts outside leaves the menu open.
    const {driver, outside} = await openContextMenu(page);
    await pan(driver, outside, {x: outside.x, y: outside.y - 40}, 300);
    await menuCloses(page);
  });

  test.fixme('a 40 px pan with no pointercancel closes it (enabled by the ContextMenu pan-dismiss work)', async ({
    page,
  }) => {
    // The same FR5 gap: the browser makes no tap, so no outside mousedown.
    const {outside} = await openContextMenu(page);
    await panWhileBusy(page, outside);
    await menuCloses(page);
  });
});
