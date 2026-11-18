// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DropdownMenuOpeningRelease.interaction.browser.spec.ts
 * @input The built Default and LabSelectableSizes DropdownMenu stories on a
 *   desktop profile, with a real mouse in Chromium and WebKit
 * @output Proof that the release of the press that opens a menu does what the
 *   press model decides. The browser's light dismiss does not undo it. A
 *   release before the settle time leaves the menu open, also off the trigger
 *   or after the trigger moved away. A settled release outside still closes
 *   the menu, and a later press outside dismisses it. A plain click still
 *   aims its pointerup and click at the trigger. After a show that waited
 *   for another popover operation, a release on the trigger leaves the menu
 *   open, and a settled release outside closes it. After the menu closes, the
 *   page listens as it did at rest.
 * @position Evidence for useMenuPress FR8's opening release with native light
 *   dismiss; the press model's own states are in menuPressGesture.test.ts
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  frames,
  openStory,
  withStorybook,
} from '@astryxdesign/interaction-harness';
import {MENU_PRESS_SETTLE_MS} from '../../hooks/menuPressGesture';

const storybook = withStorybook(test);

test.use({
  viewport: {width: 1280, height: 800},
  isMobile: false,
  hasTouch: false,
});

// A press this close to the settle time cannot be judged: the page's clock
// and the press model's clock can differ by this much.
const SETTLE_MARGIN_MS = 10;

/** The element's rendered box; a missing one fails the spec. */
async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (box == null) {
    throw new Error('the element has no rendered box');
  }
  return box;
}

function centerOf(box: {x: number; y: number; width: number; height: number}) {
  return {x: box.x + box.width / 2, y: box.y + box.height / 2};
}

// The press model times a press with `Date.now()` in its handlers. The page
// reads the same clock as the press starts and as it ends.
async function installPressClock(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as {__press: {down: number; up: number}};
    w.__press = {down: 0, up: 0};
    addEventListener(
      'pointerdown',
      () => {
        w.__press = {down: Date.now(), up: 0};
      },
      true,
    );
    addEventListener(
      'pointerup',
      () => {
        w.__press.up = Date.now();
      },
      true,
    );
  });
}

async function menuState(page: Page, trigger: Locator) {
  return {
    expanded: await trigger.getAttribute('aria-expanded'),
    open: await page.locator('[data-layer-anchored]:popover-open').count(),
  };
}

// The menu must be in the state the press model decides for this release.
// A release outside the menu before the settle time leaves it open; after
// the settle time it closes it.
async function expectModelOutcome(page: Page, trigger: Locator) {
  const {down, up} = await page.evaluate(
    () => (window as unknown as {__press: {down: number; up: number}}).__press,
  );
  expect(down, 'the press start was seen').toBeGreaterThan(0);
  expect(up, 'the press end was seen').toBeGreaterThan(0);
  const lasted = up - down;
  if (Math.abs(lasted - MENU_PRESS_SETTLE_MS) <= SETTLE_MARGIN_MS) {
    throw new Error(
      `The press lasted ${lasted} ms, within ${SETTLE_MARGIN_MS} ms of the ${MENU_PRESS_SETTLE_MS} ms settle time, so its outcome cannot be judged`,
    );
  }
  const isSettled = lasted > MENU_PRESS_SETTLE_MS;
  expect(
    await menuState(page, trigger),
    `a press of ${lasted} ms released outside the menu`,
  ).toEqual(
    isSettled ? {expanded: 'false', open: 0} : {expanded: 'true', open: 1},
  );
  return isSettled;
}

test('a quick drag off the trigger, released on the page, leaves the menu open', async ({
  page,
}) => {
  await openStory(page, storybook(), 'core-dropdownmenu--default');
  await installPressClock(page);
  const trigger = page.getByRole('button', {name: 'Actions'});
  const start = centerOf(await boxOf(trigger));
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x - 200, start.y, {steps: 2});
  await page.mouse.up();
  await frames(page, 2);
  const isSettled = await expectModelOutcome(page, trigger);
  if (!isSettled) {
    // The press is over, and its claim with it: a later press outside
    // dismisses the menu.
    await page.mouse.click(start.x - 200, start.y + 200);
    await frames(page, 2);
    expect(await menuState(page, trigger)).toEqual({
      expanded: 'false',
      open: 0,
    });
  }
});

test('the trigger moving away under a still pointer before the release leaves the menu open', async ({
  page,
}) => {
  await openStory(page, storybook(), 'core-dropdownmenu--default');
  await installPressClock(page);
  const trigger = page.getByRole('button', {name: 'Actions'});
  const start = centerOf(await boxOf(trigger));
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  // The panel that holds the trigger moves 120 px, and the pointer stays.
  const under = await page.evaluate(({x, y}) => {
    const panel = document.querySelector('#storybook-root') as HTMLElement;
    panel.style.translate = '-120px 0';
    const element = document.elementFromPoint(x, y);
    return {
      isOnTrigger: element?.closest('button') != null,
      isInMenu: element?.closest('[popover]') != null,
    };
  }, start);
  expect(under, 'the release point is off the trigger and the menu').toEqual({
    isOnTrigger: false,
    isInMenu: false,
  });
  await page.mouse.up();
  await frames(page, 2);
  await expectModelOutcome(page, trigger);
});

test('a press held past the settle time and released on the page closes the menu', async ({
  page,
}) => {
  await openStory(page, storybook(), 'core-dropdownmenu--default');
  await installPressClock(page);
  const trigger = page.getByRole('button', {name: 'Actions'});
  const start = centerOf(await boxOf(trigger));
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x - 200, start.y, {steps: 2});
  // The input itself: the press lasts past the settle time.
  await page.waitForTimeout(MENU_PRESS_SETTLE_MS + 150);
  await page.mouse.up();
  await frames(page, 2);
  expect(await expectModelOutcome(page, trigger), 'the press settled').toBe(
    true,
  );
});

// Forces a show that waits: another menu's hide runs as the next press starts,
// and the browser refuses the first show once. The layer runtime then replays
// the show once that hide ends, during the press. Returns the trigger to press.
async function forceOneWaitingShow(page: Page): Promise<Locator> {
  await openStory(page, storybook(), 'core-dropdownmenu--lab-selectable-sizes');
  const other = page.getByRole('button', {name: 'Small menu'});
  await other.click();
  await expect(other).toHaveAttribute('aria-expanded', 'true');
  await frames(page, 2);
  await page.evaluate(() => {
    const otherLayer = document.querySelector(
      '[data-layer-anchored]:popover-open',
    ) as HTMLElement;
    const w = window as unknown as {__refused: number};
    w.__refused = 0;
    addEventListener(
      'pointerdown',
      () => {
        otherLayer.hidePopover();
      },
      {capture: true, once: true},
    );
    const show = HTMLElement.prototype.showPopover;
    HTMLElement.prototype.showPopover = function (
      this: HTMLElement,
      ...args: Parameters<HTMLElement['showPopover']>
    ) {
      if (this !== otherLayer && w.__refused === 0) {
        w.__refused += 1;
        throw new DOMException('refused once by the test', 'InvalidStateError');
      }
      show.apply(this, args);
    };
  });
  return page.getByRole('button', {name: 'Large menu'});
}

async function expectReplayedShow(page: Page, trigger: Locator) {
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  expect(
    await page.evaluate(
      () => (window as unknown as {__refused: number}).__refused,
    ),
    'the first show was refused, so the open was a replay',
  ).toBe(1);
}

test('FORCED DEFERRAL: after a show that waited, a release on the trigger leaves the menu open', async ({
  page,
}) => {
  const trigger = await forceOneWaitingShow(page);
  const start = centerOf(await boxOf(trigger));
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await expectReplayedShow(page, trigger);
  await page.mouse.up();
  await frames(page, 2);
  expect(await menuState(page, trigger)).toEqual({expanded: 'true', open: 1});
});

test('FORCED DEFERRAL: after a show that waited, a settled press released on the page closes the menu', async ({
  page,
}) => {
  const trigger = await forceOneWaitingShow(page);
  await installPressClock(page);
  const start = centerOf(await boxOf(trigger));
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await expectReplayedShow(page, trigger);
  await page.mouse.move(start.x, start.y + 300, {steps: 2});
  // The input itself: the press lasts past the settle time.
  await page.waitForTimeout(MENU_PRESS_SETTLE_MS + 150);
  await page.mouse.up();
  await frames(page, 2);
  expect(await expectModelOutcome(page, trigger), 'the press settled').toBe(
    true,
  );
});

test('a plain click on the trigger still aims its pointerup and click at the trigger', async ({
  page,
}) => {
  // Registered before any page script, so it sees the click before the
  // press model's click guard swallows it, as it does on every press-open.
  await page.addInitScript(() => {
    const w = window as unknown as {__aimedAt: string[]};
    w.__aimedAt = [];
    for (const type of ['pointerup', 'click']) {
      addEventListener(
        type,
        event => {
          const target = event.target instanceof Element ? event.target : null;
          const at =
            target?.closest('[popover]') != null
              ? 'layer'
              : target?.closest('button') != null
                ? 'trigger'
                : 'page';
          w.__aimedAt.push(`${type} ${at}`);
        },
        true,
      );
    }
  });
  await openStory(page, storybook(), 'core-dropdownmenu--default');
  const trigger = page.getByRole('button', {name: 'Actions'});
  // What a caller's own pointerup handler on the trigger sees.
  await trigger.evaluate(element => {
    const w = window as unknown as {__onTrigger: number};
    w.__onTrigger = 0;
    element.addEventListener('pointerup', () => {
      w.__onTrigger += 1;
    });
  });
  await page.evaluate(() => {
    (window as unknown as {__aimedAt: string[]}).__aimedAt.length = 0;
  });
  await trigger.click();
  await frames(page, 2);
  expect(
    await page.evaluate(() => {
      const w = window as unknown as {__aimedAt: string[]; __onTrigger: number};
      return {aimedAt: w.__aimedAt, onTrigger: w.__onTrigger};
    }),
  ).toEqual({aimedAt: ['pointerup trigger', 'click trigger'], onTrigger: 1});
  expect(await menuState(page, trigger)).toEqual({expanded: 'true', open: 1});
});

// The page's listeners of the types a press claim uses, on the window and the
// document, as `target type` with an id per listener. The init script records
// them before any page script runs.
const CLAIM_TYPES = [
  'pointermove',
  'pointerup',
  'pointercancel',
  'contextmenu',
  'scroll',
  'resize',
];

async function recordPageListeners(page: Page) {
  await page.addInitScript(types => {
    interface Entry {
      target: EventTarget;
      type: string;
      listener: unknown;
      capture: boolean;
      removed: boolean;
    }
    const log: Entry[] = [];
    (window as unknown as {__listeners: Entry[]}).__listeners = log;
    const captureOf = (options: boolean | EventListenerOptions | undefined) =>
      typeof options === 'boolean' ? options : Boolean(options?.capture);
    const add = EventTarget.prototype.addEventListener;
    const remove = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function (
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | AddEventListenerOptions,
    ) {
      if ((this === window || this === document) && types.includes(type)) {
        log.push({
          target: this,
          type,
          listener,
          capture: captureOf(options),
          removed: false,
        });
      }
      return add.call(this, type, listener, options);
    };
    EventTarget.prototype.removeEventListener = function (
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | EventListenerOptions,
    ) {
      const capture = captureOf(options);
      // The latest matching add is the listener this call removes.
      for (let index = log.length - 1; index >= 0; index -= 1) {
        const entry = log[index];
        if (
          !entry.removed &&
          entry.target === this &&
          entry.type === type &&
          entry.listener === listener &&
          entry.capture === capture
        ) {
          entry.removed = true;
          break;
        }
      }
      return remove.call(this, type, listener, options);
    };
  }, CLAIM_TYPES);
}

async function pageListeners(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    (
      window as unknown as {
        __listeners: {target: EventTarget; type: string; removed: boolean}[];
      }
    ).__listeners.flatMap((e, id) =>
      e.removed
        ? []
        : [`${id} ${e.target === window ? 'window' : 'document'} ${e.type}`],
    ),
  );
}

// Closes the menu wherever a release left it. The other cases judge whether
// it stays open; this one counts listeners.
async function closeWhereverReleased(page: Page, trigger: Locator) {
  await frames(page, 2);
  if ((await trigger.getAttribute('aria-expanded')) === 'true') {
    await page.keyboard.press('Escape');
  }
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
}

test('the menu opening on a press and closing leaves the page listening as it did at rest', async ({
  page,
}) => {
  await recordPageListeners(page);
  await openStory(page, storybook(), 'core-dropdownmenu--default');
  await frames(page, 2);
  const atRest = await pageListeners(page);
  const trigger = page.getByRole('button', {name: 'Actions'});
  const start = centerOf(await boxOf(trigger));
  // A quick press released off the trigger, which the menu claims.
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x - 200, start.y, {steps: 2});
  await page.mouse.up();
  await closeWhereverReleased(page, trigger);
  // A plain click, which the trigger keeps.
  await page.mouse.click(start.x, start.y);
  await closeWhereverReleased(page, trigger);
  await frames(page, 2);
  expect(await pageListeners(page)).toEqual(atRest);
});
