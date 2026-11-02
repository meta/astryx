// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file SliderFinePointer.interaction.browser.spec.ts
 * @input The built Storybook's Slider stories in a desktop context (no touch,
 *   not mobile: a fine primary pointer), driven by Playwright's mouse
 * @output Proofs that Slider's gestures attach for every pointer
 *   (`spec:AST-094` FR43): a mouse drag on a thumb pans, claiming after
 *   FR19's 10 px; each gesture element keeps one passive `pointerdown`
 *   listener and the gesture host listens on the page only during a press
 *   (FR24); and the touch targets stay coarse-only.
 * @position Browser proof beside SliderTouch.interaction.browser.spec.ts,
 *   which drives a finger under phone emulation.
 */

import {expect, test, type Locator, type Page} from '@playwright/test';
import {
  openStory,
  WHEEL_SKIP,
  webInputDriver,
  withStorybook,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

// A desktop context: the primary pointer is fine (a mouse).
test.use({
  isMobile: false,
  hasTouch: false,
  // WebKit takes wheel input only in a desktop context at scale 1.
  deviceScaleFactor: 1,
  viewport: {width: 800, height: 600},
});

/** UIKit's pan hysteresis, which governs every claim (`spec:AST-094` FR19). */
const HYSTERESIS = 10;

/** One listener registration, as the page recorded it. */
interface Registration {
  readonly type: string;
  readonly passive: boolean;
}

/**
 * Records every listener the page adds and removes, before its scripts run,
 * so the gesture host's listeners can be read off each element and off the
 * document.
 */
async function recordListeners(page: Page): Promise<void> {
  await page.addInitScript(() => {
    interface Entry {
      target: EventTarget;
      type: string;
      listener: unknown;
      capture: boolean;
      passive: boolean;
      removed: boolean;
    }
    const log: Entry[] = [];
    (window as unknown as {__listeners: Entry[]}).__listeners = log;
    const flags = (options: boolean | AddEventListenerOptions | undefined) =>
      typeof options === 'boolean'
        ? {capture: options, passive: false}
        : {
            capture: Boolean(options?.capture),
            passive: Boolean(options?.passive),
          };
    const add = EventTarget.prototype.addEventListener;
    const remove = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function (
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | AddEventListenerOptions,
    ) {
      log.push({
        target: this,
        type,
        listener,
        removed: false,
        ...flags(options),
      });
      return add.call(this, type, listener, options);
    };
    EventTarget.prototype.removeEventListener = function (
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | EventListenerOptions,
    ) {
      const {capture} = flags(options);
      for (const entry of log) {
        if (
          !entry.removed &&
          entry.target === this &&
          entry.type === type &&
          entry.listener === listener &&
          entry.capture === capture
        ) {
          entry.removed = true;
        }
      }
      return remove.call(this, type, listener, options);
    };
  });
}

/**
 * The passive pointer listeners live on `element` now: the gesture host's
 * (other features keep their own, such as the value tooltip's hover).
 */
async function pointerListenersOn(element: Locator): Promise<Registration[]> {
  return element.evaluate(node =>
    (
      window as unknown as {
        __listeners: {
          target: EventTarget;
          type: string;
          passive: boolean;
          removed: boolean;
        }[];
      }
    ).__listeners
      .filter(
        entry =>
          !entry.removed &&
          entry.passive &&
          entry.target === node &&
          entry.type.startsWith('pointer'),
      )
      .map(({type, passive}) => ({type, passive})),
  );
}

/**
 * The passive pointer listeners live on the document and the window now (the
 * gesture host's; Storybook's own tools add others), each with its
 * registration's index, so one added during a press can be told from a
 * listener of the same type that was already there.
 */
async function pageListeners(
  page: Page,
): Promise<{id: number; type: string}[]> {
  return page.evaluate(() =>
    (
      window as unknown as {
        __listeners: {
          target: EventTarget;
          type: string;
          passive: boolean;
          removed: boolean;
        }[];
      }
    ).__listeners.flatMap((entry, id) =>
      !entry.removed &&
      entry.passive &&
      (entry.target === document || entry.target === window) &&
      entry.type.startsWith('pointer')
        ? [{id, type: entry.type}]
        : [],
    ),
  );
}

async function openSlider(page: Page, storyId: string, name?: string) {
  await openStory(page, storybook(), storyId);
  expect(
    await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
  ).toBe(false);
  const thumb =
    name == null
      ? page.getByRole('slider').first()
      : page.getByRole('slider', {name});
  await expect(thumb).toBeVisible();
  const control = thumb.locator(
    'xpath=ancestor::*[contains(@class, "astryx-slider-control")][1]',
  );
  const center = async () => {
    const box = await thumb.boundingBox();
    if (box == null) {
      throw new Error('no thumb box');
    }
    return {x: box.x + box.width / 2, y: box.y + box.height / 2};
  };
  const value = async () => Number(await thumb.getAttribute('aria-valuenow'));
  const length = await control.evaluate(element =>
    parseFloat(getComputedStyle(element).width),
  );
  return {thumb, control, center, value, length};
}

test('under a fine pointer the thumb and the track each keep one passive pointerdown listener, the host listens on the page only during a press, and no touch target renders (spec:AST-094 FR24, FR43)', async ({
  page,
}) => {
  await recordListeners(page);
  const {thumb, control, center} = await openSlider(
    page,
    'core-slider--touch-tracking',
    'Brightness',
  );
  // The thumb's pan and the track's tap attach for a mouse too (FR43): each
  // element listens with one passive pointerdown and nothing else (FR24).
  await expect
    .poll(async () => pointerListenersOn(thumb))
    .toEqual([{type: 'pointerdown', passive: true}]);
  expect(await pointerListenersOn(control)).toEqual([
    {type: 'pointerdown', passive: true},
  ]);
  // The 48 px touch target stays coarse-only (FR43).
  await expect(page.locator('[data-slider-hit]')).toHaveCount(0);
  // At rest the host adds nothing to the page; a press adds its page
  // listeners, and the release removes them.
  const atRest = await pageListeners(page);
  const restIds = new Set(atRest.map(({id}) => id));
  const at = await center();
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  const added = (await pageListeners(page))
    .filter(({id}) => !restIds.has(id))
    .map(({type}) => type);
  expect(added).toEqual(expect.arrayContaining(['pointermove', 'pointerup']));
  await page.mouse.up();
  await expect.poll(async () => pageListeners(page)).toEqual(atRest);
});

test('a mouse drag on a thumb pans: the value holds through the 10 px hysteresis, then follows the pointer’s travel over the track length (spec:AST-094 FR43, FR19)', async ({
  page,
}) => {
  const {control, center, value, length} = await openSlider(
    page,
    'core-slider--default',
  );
  // The host writes the track's touch-action for every pointer (FR18), so
  // its mark shows that the slider's gestures are attached.
  await expect
    .poll(async () =>
      control.evaluate(element =>
        element.getAttribute('data-astryx-touch-action'),
      ),
    )
    .toBe('manipulation');
  const start = await value();
  const at = await center();
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  // Inside the hysteresis nothing claims the drag, so the value holds.
  await page.mouse.move(at.x + HYSTERESIS - 4, at.y, {steps: 3});
  expect(await value()).toBe(start);
  // Past it the value follows the travel beyond the claim, as UISlider's.
  // The value renders after the move's frame, so the reads wait for it.
  for (const travel of [30, 60]) {
    await page.mouse.move(at.x + travel, at.y, {steps: 5});
    await expect
      .poll(value)
      .toBe(Math.round(start + ((travel - HYSTERESIS) * 100) / length));
  }
  await page.mouse.up();
});

test('a right click on the track moves nothing and paints nothing: only a primary click presses (spec:AST-094 FR43)', async ({
  page,
}) => {
  const {thumb, control, value} = await openSlider(
    page,
    'core-slider--default',
  );
  await expect
    .poll(async () =>
      control.evaluate(element =>
        element.getAttribute('data-astryx-touch-action'),
      ),
    )
    .toBe('manipulation');
  const paint = async () =>
    thumb.evaluate(element => getComputedStyle(element).backgroundImage);
  const start = await value();
  const box = await control.boundingBox();
  if (box == null) {
    throw new Error('no control');
  }
  const at = {x: box.x + box.width * 0.2, y: box.y + box.height / 2};
  await page.mouse.move(at.x, at.y);
  // A right click is the page's context request (FR43), not a press.
  await page.mouse.down({button: 'right'});
  expect(await paint()).toBe('none');
  await page.mouse.up({button: 'right'});
  expect(await value()).toBe(start);
  // A primary click there still sets the value.
  await page.mouse.click(at.x, at.y);
  expect(await value()).toBeLessThan(start);
});

test('a wheel or a trackpad’s scroll over a thumb leaves the value and the page keeps it, in either direction: a control’s thumb is no pan', async ({
  page,
}) => {
  const driver = await webInputDriver(page);
  test.skip(!driver.wheels, WHEEL_SKIP);
  await recordListeners(page);
  const {thumb, control, center, value} = await openSlider(
    page,
    'core-slider--default',
  );
  await expect
    .poll(async () =>
      control.evaluate(element =>
        element.getAttribute('data-astryx-touch-action'),
      ),
    )
    .toBe('manipulation');
  // The thumb listens for no wheel (spec:AST-094 FR24).
  expect(
    await thumb.evaluate(node =>
      (
        window as unknown as {
          __listeners: {target: EventTarget; type: string; removed: boolean}[];
        }
      ).__listeners.some(
        entry =>
          !entry.removed && entry.target === node && entry.type === 'wheel',
      ),
    ),
  ).toBe(false);
  // Every wheel reaches the page unprevented: the page scrolls as it would.
  await page.evaluate(() => {
    const w = window as unknown as {__wheels: boolean[]};
    w.__wheels = [];
    window.addEventListener(
      'wheel',
      event => {
        w.__wheels.push(event.defaultPrevented);
      },
      {passive: true},
    );
  });
  const prevented = async () =>
    page.evaluate(() =>
      (window as unknown as {__wheels: boolean[]}).__wheels.some(Boolean),
    );
  /** A wheel gesture ends after a quiet spell (100 ms): wait it out. */
  const settle = async () => page.waitForTimeout(250);
  const start = await value();
  const at = await center();
  // A wheel's vertical notch, a horizontal notch (Shift and the wheel) and
  // a trackpad's horizontal scroll: none moves the value.
  await driver.wheel({x: at.x, y: at.y, dy: 100});
  await settle();
  await driver.wheel({x: at.x, y: at.y, dx: -100});
  await settle();
  for (let step = 0; step < 10; step += 1) {
    await driver.wheel({x: at.x, y: at.y, dx: -6});
  }
  await settle();
  expect(await value()).toBe(start);
  expect(await prevented()).toBe(false);
});

test('a mouse drag that starts off the travel still moves the thumb, by its travel along it (spec:AST-094 FR43)', async ({
  page,
}) => {
  const {center, value, length} = await openSlider(
    page,
    'core-slider--default',
  );
  const start = await value();
  const at = await center();
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  // The first 12 px run straight across the travel: a mouse's pan claims
  // after the same 10 px in any direction, since a mouse has no page scroll
  // to yield to.
  await page.mouse.move(at.x, at.y + 12, {steps: 3});
  // Then 60 px along it: the threshold lies across the travel, so all 60
  // count.
  await page.mouse.move(at.x + 60, at.y + 12, {steps: 6});
  await expect.poll(value).toBe(Math.round(start + (60 * 100) / length));
  await page.mouse.up();
});
