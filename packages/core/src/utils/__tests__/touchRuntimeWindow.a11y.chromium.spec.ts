// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file touchRuntimeWindow.a11y.chromium.spec.ts
 * @input The SegmentedControl Default story and the BottomSheet showcase
 *   story in Chromium, with the touch runtime's chunk held back and then let
 *   through
 * @output Browser evidence for the window before the shared touch runtime
 *   loads: a press that leaves a SegmentedControl selects nothing, before and
 *   after the load, and a bottom sheet dragged closed before the load leaves
 *   the screen instead of staying where the finger let go
 * @position `architecture:react-component-runtime` INV13 and
 *   `spec:AST-080` DEC-5; the loader's timing is in touchRuntime.test.tsx
 */

import {
  expect,
  test,
  type Page,
  type Route,
} from '@astryxdesign/a11y-spec/playwright';
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

/**
 * Holds back the touch runtime's chunk until `release` runs. `requested`
 * reports whether the page asked for it, so a renamed chunk cannot pass the
 * test by accident.
 */
async function holdTouchRuntime(page: Page) {
  const state: {held: Route | null; isReleased: boolean} = {
    held: null,
    isReleased: false,
  };
  await page.route(/touchRuntimeModules[^/]*\.js(\?.*)?$/, async route => {
    if (state.isReleased) {
      await route.continue();
      return;
    }
    state.held = route;
  });
  return {
    requested: () => state.held != null || state.isReleased,
    release: async () => {
      state.isReleased = true;
      const route = state.held;
      state.held = null;
      if (route != null) {
        await route.continue();
      }
    },
  };
}

/** A mouse press on `name` that leaves the control before it lifts. */
async function pressAndLeave(page: Page, name: string) {
  const segment = page.getByRole('radio', {name});
  const box = await segment.boundingBox();
  if (box == null) {
    throw new Error(`no box for ${name}`);
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 300, {steps: 4});
  await page.mouse.up();
}

test('a press that leaves a SegmentedControl selects nothing, before and after the touch runtime loads', async ({
  page,
}) => {
  const runtime = await holdTouchRuntime(page);
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-segmentedcontrol--default&viewMode=story`,
  );
  const grid = page.getByRole('radio', {name: 'Grid'});
  await expect(grid).toBeChecked();
  // Focus is in the group, so a focus move by a press could select.
  await grid.focus();
  await expect.poll(runtime.requested).toBe(true);

  await pressAndLeave(page, 'List');
  await expect(grid).toBeChecked();

  await runtime.release();
  // Once the runtime has mounted, the press is tracked: the same press still
  // selects nothing, and a click selects.
  await page.waitForTimeout(500);
  await grid.focus();
  await pressAndLeave(page, 'Table');
  await expect(grid).toBeChecked();
  await page.getByRole('radio', {name: 'List'}).click();
  await expect(page.getByRole('radio', {name: 'List'})).toBeChecked();
});

test.describe('a bottom sheet before the touch runtime loads', () => {
  test.use({hasTouch: true, viewport: {width: 390, height: 844}});

  test('a drag that closes it lets it leave the screen', async ({page}) => {
    const runtime = await holdTouchRuntime(page);
    await page.goto(
      `${storybook.origin}/iframe.html?id=core-bottomsheet--showcase&viewMode=story`,
    );
    await page.getByRole('button', {name: 'Open sheet'}).click();
    const dialog = page.getByRole('dialog', {name: 'Filters'});
    await expect(dialog).toBeVisible();
    await expect.poll(runtime.requested).toBe(true);
    const sheet = dialog.locator('.astryx-bottom-sheet').first();
    const box = await sheet.boundingBox();
    if (box == null) {
      throw new Error('no sheet box');
    }
    const x = box.x + box.width / 2;
    const y = box.y + 12;
    const cdp = await page.context().newCDPSession(page);
    const base = Date.now();
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{x, y}],
      timestamp: base / 1000,
    });
    for (let i = 1; i <= 6; i += 1) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{x, y: y + (240 * i) / 6}],
        timestamp: (base + (60 * i) / 6) / 1000,
      });
    }
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
      timestamp: (base + 61) / 1000,
    });
    // The sheet goes on past where the finger let go, and the dialog closes.
    const releasedTop = y + 240 - 12;
    await expect
      .poll(
        async () => (await sheet.boundingBox())?.y ?? Number.POSITIVE_INFINITY,
        {timeout: 1500},
      )
      .toBeGreaterThan(releasedTop + 100);
    await expect(dialog).toBeHidden({timeout: 1500});
    await runtime.release();
  });
});
