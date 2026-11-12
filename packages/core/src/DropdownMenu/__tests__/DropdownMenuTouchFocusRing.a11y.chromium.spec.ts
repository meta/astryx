// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DropdownMenuTouchFocusRing.a11y.chromium.spec.ts
 * @input Built DropdownMenu stories and real Chromium touch (CDP) and keyboard
 *   input
 * @output Browser evidence that the menu's own focus moves follow the last
 *   input: a finger's hold-slide-lift and a finger's tap paint no focus ring
 *   on the trigger in any frame, and a keyboard open and close still ring it
 * @position Real-engine proof for architecture:interaction-modality INV1 on
 *   the menu trigger; jsdom does not compute :focus-visible
 */

import {
  expect,
  test,
  type Page,
  type CDPSession,
} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';
import {waitForRest} from '@astryxdesign/interaction-harness';

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

const MENU_STORY = 'core-dropdownmenu--default';
const TRIGGER = '#storybook-root [aria-haspopup="menu"]';

async function mount(page: Page) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=${MENU_STORY}&viewMode=story`,
  );
  await expect(page.locator(TRIGGER)).toBeVisible();
}

async function enableTouch(page: Page): Promise<CDPSession> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', {
    enabled: true,
    maxTouchPoints: 2,
  });
  await cdp.send('Emulation.setEmitTouchEventsForMouse', {enabled: false});
  return cdp;
}

async function center(page: Page, selector: string, name?: string) {
  const locator =
    name == null
      ? page.locator(selector)
      : page.getByRole('menuitem', {name, exact: true});
  const box = await locator.boundingBox();
  if (box == null) {
    throw new Error(`${selector} ${name ?? ''} has no rendered bounds`);
  }
  return {x: box.x + box.width / 2, y: box.y + box.height / 2};
}

async function touchAt(
  cdp: CDPSession,
  type: 'touchStart' | 'touchMove',
  p: {x: number; y: number},
) {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: [{x: p.x, y: p.y, id: 1}],
  });
}

async function touchEnd(cdp: CDPSession) {
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
}

/**
 * Records, every frame, whether the trigger paints its focus ring: it matches
 * `:focus-visible` while it has focus. A one-frame flash counts.
 */
async function recordTriggerRing(page: Page) {
  await page.evaluate(selector => {
    const trigger = document.querySelector(selector);
    const frames: boolean[] = [];
    const record = () => {
      frames.push(
        trigger != null &&
          document.activeElement === trigger &&
          trigger.matches(':focus-visible'),
      );
      (window as {__ringFrame?: number}).__ringFrame =
        requestAnimationFrame(record);
    };
    (window as {__ringFrames?: boolean[]}).__ringFrames = frames;
    record();
  }, TRIGGER);
}

async function stopRecording(page: Page) {
  return page.evaluate(() => {
    const view = window as {__ringFrame?: number; __ringFrames?: boolean[]};
    if (view.__ringFrame != null) {
      cancelAnimationFrame(view.__ringFrame);
    }
    const frames = view.__ringFrames ?? [];
    return {frames: frames.length, ringed: frames.filter(Boolean).length};
  });
}

test.describe('DropdownMenu trigger focus ring follows the last input (Chromium)', () => {
  test('touch: a hold that opens the menu, slides onto a row and lifts paints no ring on the trigger in any frame', async ({
    page,
  }) => {
    const cdp = await enableTouch(page);
    await mount(page);
    await recordTriggerRing(page);

    const trigger = await center(page, TRIGGER);
    await touchAt(cdp, 'touchStart', trigger);
    const menu = page.getByRole('menu');
    // The long-press delay opens the menu with the finger still down.
    await expect(menu).toBeVisible();
    const row = await center(page, 'menuitem', 'Duplicate');
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      await touchAt(cdp, 'touchMove', {
        x: trigger.x + ((row.x - trigger.x) * i) / steps,
        y: trigger.y + ((row.y - trigger.y) * i) / steps,
      });
    }
    await touchEnd(cdp);
    await expect(menu).toBeHidden();
    await page.waitForTimeout(300);

    const {frames, ringed} = await stopRecording(page);
    expect(frames).toBeGreaterThan(10);
    expect(ringed, `${ringed} of ${frames} frames ringed the trigger`).toBe(0);
  });

  test('touch: a tap open and a tap on a row paint no ring on the trigger in any frame', async ({
    page,
  }) => {
    const cdp = await enableTouch(page);
    await mount(page);
    await recordTriggerRing(page);

    await touchAt(cdp, 'touchStart', await center(page, TRIGGER));
    await touchEnd(cdp);
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    // The menu ignores a tap while it is still entering, so tap the row once
    // the entrance rests.
    await waitForRest(page.locator('[popover]:has([role="menu"])').first());
    await touchAt(
      cdp,
      'touchStart',
      await center(page, 'menuitem', 'Duplicate'),
    );
    await touchEnd(cdp);
    await expect(menu).toBeHidden();
    await page.waitForTimeout(300);

    const {frames, ringed} = await stopRecording(page);
    expect(ringed, `${ringed} of ${frames} frames ringed the trigger`).toBe(0);
  });

  test('keyboard: an open from the trigger and an Escape close still ring the trigger', async ({
    page,
  }) => {
    await mount(page);
    const trigger = page.locator(TRIGGER);
    await page.keyboard.press('Tab');
    await expect(trigger).toBeFocused();
    await page.keyboard.press('Enter');
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
    expect(await trigger.evaluate(el => el.matches(':focus-visible'))).toBe(
      true,
    );
  });
});
