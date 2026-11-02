// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y always

/**
 * @file TouchTrigger.a11y.chromium.spec.ts
 * @input The `Core/Tooltip` and `Core/HoverCard` Touch Triggers stories in a
 *   built Storybook, driven by real Chromium touch input (CDP) in a phone-sized
 *   viewport.
 * @output Real-engine proof that a hover layer answers a touch only once it is
 *   a tap: it opens when the finger lifts, stays shut while a finger rests on
 *   the trigger, never opens for a touch that turns into a scroll, and a
 *   tap-opened layer closes when a tap outside lifts or a scroll starts
 *   outside.
 * @position Run with `pnpm test:a11y-contract`. Only a real engine decides
 *   whether a touch is a tap, a scroll or a long press, so these outcomes
 *   cannot be shown in jsdom; the unit suites (Tooltip.test.tsx,
 *   HoverCard.test.tsx) cover the same rules on synthetic events.
 */

import {
  expect,
  test,
  type CDPSession,
  type Locator,
  type Page,
} from '@playwright/test';
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

test.use({hasTouch: true, isMobile: true, viewport: {width: 390, height: 844}});

interface Finger {
  down(x: number, y: number): Promise<void>;
  move(x: number, y: number): Promise<void>;
  up(): Promise<void>;
}

async function openStory(page: Page, id: string): Promise<Finger> {
  await page.goto(`${storybook.origin}/iframe.html?id=${id}&viewMode=story`);
  // Room to scroll, so a drag is a page scroll the browser takes from us.
  await page.evaluate(() => {
    const spacer = document.createElement('div');
    spacer.style.height = '2000px';
    document.body.append(spacer);
  });
  const cdp: CDPSession = await page.context().newCDPSession(page);
  return {
    down: async (x, y) => {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{x, y}],
      });
    },
    move: async (x, y) => {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{x, y}],
      });
    },
    up: async () => {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
    },
  };
}

async function centerOf(target: Locator): Promise<[number, number]> {
  const box = await target.boundingBox();
  if (box == null) {
    throw new Error('the trigger has no layout box');
  }
  return [
    Math.round(box.x + box.width / 2),
    Math.round(box.y + box.height / 2),
  ];
}

/** A blank point of the page, away from every trigger. */
const OUTSIDE: [number, number] = [360, 700];

const cases = [
  {
    name: 'Tooltip',
    story: 'core-tooltip--touch-triggers',
    trigger: (page: Page) => page.getByText('hover-able term', {exact: true}),
    action: (page: Page) => page.getByRole('button', {name: 'Save'}),
    layer: '.astryx-tooltip:popover-open',
  },
  {
    name: 'HoverCard',
    story: 'core-hovercard--touch-triggers',
    trigger: (page: Page) => page.getByText('Jane Doe', {exact: true}),
    action: (page: Page) => page.getByRole('button', {name: 'Open profile'}),
    layer: '.astryx-hover-card:popover-open',
  },
];

for (const {name, story, trigger, action, layer} of cases) {
  test.describe(`${name} under a finger`, () => {
    test('opens when the tap lifts, not when the finger lands', async ({
      page,
    }) => {
      const finger = await openStory(page, story);
      const [x, y] = await centerOf(trigger(page));
      await finger.down(x, y);
      await page.waitForTimeout(150);
      // The finger is still down: it may yet be starting a scroll.
      await expect(page.locator(layer)).toHaveCount(0);
      await finger.up();
      await expect(page.locator(layer)).toHaveCount(1);
    });

    test('never opens for a touch that turns into a scroll', async ({page}) => {
      const finger = await openStory(page, story);
      const [x, y] = await centerOf(trigger(page));
      await finger.down(x, y);
      for (let step = 1; step <= 8; step += 1) {
        await finger.move(x, y - step * 10);
        await page.waitForTimeout(16);
      }
      await finger.up();
      await page.waitForTimeout(300);
      await expect(page.locator(layer)).toHaveCount(0);
    });

    test('stays shut while a finger rests on the trigger', async ({page}) => {
      const finger = await openStory(page, story);
      const [x, y] = await centerOf(trigger(page));
      await finger.down(x, y);
      await page.waitForTimeout(900);
      // Nothing is decided until the finger lifts; whether a long hold still
      // counts as a tap then is the engine's call (UIKit's own tap allows a
      // hold of up to 1.5 s).
      await expect(page.locator(layer)).toHaveCount(0);
      await finger.up();
    });

    test('closes when a tap outside lifts, not when it lands', async ({
      page,
    }) => {
      const finger = await openStory(page, story);
      const [x, y] = await centerOf(trigger(page));
      await finger.down(x, y);
      await finger.up();
      await expect(page.locator(layer)).toHaveCount(1);

      await finger.down(...OUTSIDE);
      await page.waitForTimeout(150);
      await expect(page.locator(layer)).toHaveCount(1);
      await finger.up();
      await expect(page.locator(layer)).toHaveCount(0);
    });

    test('closes as soon as a scroll that starts outside takes the touch', async ({
      page,
    }) => {
      const finger = await openStory(page, story);
      const [x, y] = await centerOf(trigger(page));
      await finger.down(x, y);
      await finger.up();
      await expect(page.locator(layer)).toHaveCount(1);

      const [ox, oy] = OUTSIDE;
      await finger.down(ox, oy);
      for (let step = 1; step <= 8; step += 1) {
        await finger.move(ox, oy - step * 10);
        await page.waitForTimeout(16);
      }
      // Still down: the scroll took the touch, which is the dismissal.
      await expect(page.locator(layer)).toHaveCount(0);
      await finger.up();
    });

    test('leaves a tap on a trigger that acts to that trigger', async ({
      page,
    }) => {
      const finger = await openStory(page, story);
      const [x, y] = await centerOf(action(page));
      await finger.down(x, y);
      await finger.up();
      await page.waitForTimeout(300);
      await expect(page.locator(layer)).toHaveCount(0);
    });
  });
}
