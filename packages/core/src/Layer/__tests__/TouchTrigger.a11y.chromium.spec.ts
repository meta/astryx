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

test.describe('Tooltip triggerBehavior="toggle" (component:Tooltip FR9, FR10)', () => {
  const STORY = 'a11y-tooltip-toggle-behavior--button-toggle';
  const CARD_STORY = 'a11y-tooltip-toggle-behavior--in-a-clickable-card';
  const LAYER = '.astryx-tooltip:popover-open';
  const pinButton = (page: Page) =>
    page.getByRole('button', {name: 'What is this?'});

  test('a real tap pins the tooltip, and the next tap on the trigger closes it', async ({
    page,
  }) => {
    const finger = await openStory(page, STORY);
    const button = pinButton(page);
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    const [x, y] = await centerOf(button);
    await finger.down(x, y);
    await finger.up();
    await expect(page.locator(LAYER)).toHaveCount(1);
    await expect(page.locator(LAYER)).toBeVisible();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await finger.down(x, y);
    await finger.up();
    await expect(page.locator(LAYER)).toHaveCount(0);
    await expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  test('a tap outside closes a pinned tooltip', async ({page}) => {
    const finger = await openStory(page, STORY);
    const button = pinButton(page);
    await expect(button).toBeVisible();
    const [x, y] = await centerOf(button);
    await finger.down(x, y);
    await finger.up();
    await expect(page.locator(LAYER)).toHaveCount(1);
    await finger.down(...OUTSIDE);
    await finger.up();
    await expect(page.locator(LAYER)).toHaveCount(0);
    await expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  test('Enter pins it and Space closes it from the keyboard', async ({
    page,
  }) => {
    await openStory(page, STORY);
    const button = pinButton(page);
    await expect(button).toBeVisible();
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator(LAYER)).toHaveCount(1);
    await page.keyboard.press(' ');
    await expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  test('a tap on the trigger inside a clickable card pins its tooltip and stops there', async ({
    page,
  }) => {
    const finger = await openStory(page, CARD_STORY);
    const button = pinButton(page);
    const count = page.getByText(/^Card opened \d+ times$/);
    await expect(button).toBeVisible();
    await expect(count).toHaveText('Card opened 0 times');
    const [x, y] = await centerOf(button);
    await finger.down(x, y);
    await finger.up();
    await expect(page.locator(LAYER)).toHaveCount(1);
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(count).toHaveText('Card opened 0 times');
    await page.mouse.click(x, y);
    await expect(page.locator(LAYER)).toHaveCount(0);
    await expect(count).toHaveText('Card opened 0 times');
  });
});

test.describe('Tooltip triggerBehavior under a finger and a pen (component:Tooltip FR5, FR9)', () => {
  const STORY = 'a11y-tooltip-toggle-behavior--trigger-behaviors';
  const LAYER = '.astryx-tooltip:popover-open';
  const term = (page: Page, name: string) =>
    page.getByText(name, {exact: true});

  /** A tap: a finger through touch events, or a landed pen through pen-typed presses. */
  async function tapWith(
    page: Page,
    finger: Finger,
    target: Locator,
    pointer: 'finger' | 'pen',
  ) {
    const [x, y] = await centerOf(target);
    if (pointer === 'finger') {
      await finger.down(x, y);
      await finger.up();
      return;
    }
    const cdp = await page.context().newCDPSession(page);
    for (const type of ['mousePressed', 'mouseReleased'] as const) {
      await cdp.send('Input.dispatchMouseEvent', {
        type,
        x,
        y,
        button: 'left',
        clickCount: 1,
        pointerType: 'pen',
      });
    }
  }

  for (const pointer of ['finger', 'pen'] as const) {
    test(`a ${pointer} tap never opens hover, opens adaptive, and pins toggle`, async ({
      page,
    }) => {
      const finger = await openStory(page, STORY);
      await tapWith(page, finger, term(page, 'Hover term'), pointer);
      await page.waitForTimeout(300);
      await expect(page.locator(LAYER)).toHaveCount(0);
      await tapWith(page, finger, term(page, 'Adaptive term'), pointer);
      await expect(page.locator(LAYER)).toHaveText('Adaptive: a tap opens it');
      const toggle = page.getByRole('button', {name: 'Toggle term'});
      await tapWith(page, finger, toggle, pointer);
      await expect(page.locator(LAYER)).toHaveText('Toggle: a press pins it');
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    });
  }
});

test.describe('a pinned layer under a mouse (component:Tooltip FR9)', () => {
  test.use({
    hasTouch: false,
    isMobile: false,
    viewport: {width: 1024, height: 768},
  });

  async function open(page: Page, id: string) {
    await page.goto(`${storybook.origin}/iframe.html?id=${id}&viewMode=story`);
  }

  /** Whether focus sits on no element: a press on text that takes none. */
  async function focusIsOnBody(page: Page): Promise<boolean> {
    return page.evaluate(() => document.activeElement === document.body);
  }

  test('a click on a pinned tooltip’s own text keeps it pinned', async ({
    page,
  }) => {
    await open(page, 'a11y-tooltip-toggle-behavior--button-toggle');
    const button = page.getByRole('button', {name: 'What is this?'});
    const layer = page.locator('.astryx-tooltip:popover-open');
    await button.click();
    await expect(layer).toHaveCount(1);
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await layer
      .getByText('Rows are ranked by how many places import the icon')
      .click();
    expect(await focusIsOnBody(page)).toBe(true);
    await expect(layer).toHaveCount(1);
    await expect(button).toHaveAttribute('aria-expanded', 'true');
  });

  test('a click on an anchored trigger runs its own click handler and pins it, and the card around it ignores the press', async ({
    page,
  }) => {
    await open(page, 'a11y-tooltip-toggle-behavior--anchored-action-in-a-card');
    const button = page.getByRole('button', {name: 'What is this?'});
    const layer = page.locator('.astryx-tooltip:popover-open');
    const opened = page.getByText(/^Card opened \d+ times$/);
    const pressed = page.getByText(/^Button pressed \d+ times$/);
    await expect(opened).toHaveText('Card opened 0 times');
    await expect(pressed).toHaveText('Button pressed 0 times');
    await button.click();
    await expect(layer).toHaveCount(1);
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(pressed).toHaveText('Button pressed 1 times');
    await expect(opened).toHaveText('Card opened 0 times');
    await button.click();
    await expect(layer).toHaveCount(0);
    await expect(pressed).toHaveText('Button pressed 2 times');
    await expect(opened).toHaveText('Card opened 0 times');
  });

  test('with focusTrigger="never", Tab to another control closes a pinned tooltip', async ({
    page,
  }) => {
    await open(page, 'a11y-tooltip-toggle-behavior--focus-trigger-never');
    const button = page.getByRole('button', {name: 'What is this?'});
    const layer = page.locator('.astryx-tooltip:popover-open');
    await button.click();
    await expect(layer).toHaveCount(1);
    await expect(button).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', {name: 'Next'})).toBeFocused();
    await expect(layer).toHaveCount(0);
    await expect(button).toHaveAttribute('aria-expanded', 'false');
  });
});
