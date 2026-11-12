// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ToastCatch.interaction.browser.spec.ts
 * @input The error Toast story (no auto-hide) on a phone, under a finger
 * @output Proves that a finger catches the card while it springs back and
 *   while it leaves, holds it there, then moves it. A card caught on its way
 *   out, or dismissed during a drag, leaves at the lift. Under reduced motion
 *   a spring-back fades once. A dragging or catching finger starts no text
 *   selection; a still hold on a resting card can. A tap during the entrance
 *   leaves it running. A catch whose lift is lost ends at the next touch
 * @position Toast's interaction proofs that its motion is interruptible
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  openStory,
  touchDriver,
  waitForRest,
  withStorybook,
  type TouchFrame,
  type TouchScript,
} from '@astryxdesign/interaction-harness';
import {toast as TOAST} from '../../motion/uikit/toast';

const storybook = withStorybook(test);

test.use({
  viewport: {width: 390, height: 844},
  isMobile: true,
  hasTouch: true,
});

const FRAME_MS = 1000 / 60;

interface CardFrame {
  t: number;
  /** The card's vertical translate (px), or null once it is gone. */
  y: number | null;
}

/** When each touch landed, first moved and lifted, on the page's clock. */
interface TouchTimes {
  down: number;
  firstMove: number | null;
  up: number | null;
}

interface Recorder {
  __frames: CardFrame[];
  __touches: TouchTimes[];
}

/** Shows the error toast, which stays until it is dismissed, at rest. */
async function showToast(page: Page): Promise<Locator> {
  await openStory(page, storybook(), 'core-toast--error-persists');
  await page
    .getByRole('button', {name: 'Trigger error'})
    .evaluate(element => (element as HTMLElement).click());
  const card = page.locator('.astryx-toast').first();
  await expect(card).toBeVisible();
  await waitForRest(card);
  return card;
}

/**
 * Records, in the page, the card's translate on every frame and when each
 * touch lands, first moves and lifts. A read per frame in the page keeps the
 * script in real time. The times are the page's clock when each event runs:
 * an event's own time stamp can follow the script's clock instead.
 */
async function recordCard(page: Page): Promise<void> {
  await page.evaluate(() => {
    const recorder = window as unknown as Recorder;
    recorder.__frames = [];
    recorder.__touches = [];
    const current = () => recorder.__touches[recorder.__touches.length - 1];
    const options = {capture: true, passive: true};
    window.addEventListener(
      'touchstart',
      () => {
        recorder.__touches.push({
          down: performance.now(),
          firstMove: null,
          up: null,
        });
      },
      options,
    );
    window.addEventListener(
      'touchmove',
      () => {
        const touch = current();
        if (touch != null && touch.firstMove == null) {
          touch.firstMove = performance.now();
        }
      },
      options,
    );
    window.addEventListener(
      'touchend',
      () => {
        const touch = current();
        if (touch != null) {
          touch.up = performance.now();
        }
      },
      options,
    );
    const tick = (t: number) => {
      const card = document.querySelector('.astryx-toast');
      let y: number | null = null;
      if (card != null) {
        const value = getComputedStyle(card).translate;
        const [, ty = '0px'] = value === 'none' ? [] : value.split(' ');
        y = Number.parseFloat(ty);
      }
      recorder.__frames.push({t, y});
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function readRecord(page: Page): Promise<Recorder> {
  return page.evaluate(() => {
    const {__frames, __touches} = window as unknown as Recorder;
    return {__frames, __touches};
  });
}

/**
 * Waits in the page until the card has moved `by` px from `from` toward
 * `toward`, and returns its box then. A finger then lands mid-motion,
 * whatever the driver's pacing.
 */
async function waitForMotion(
  page: Page,
  from: number,
  toward: number,
  by: number,
): Promise<{x: number; y: number}> {
  const handle = await page.waitForFunction(
    ({from, toward, by}) => {
      const card = document.querySelector('.astryx-toast');
      if (card == null) {
        return null;
      }
      const value = getComputedStyle(card).translate;
      const [, ty = '0px'] = value === 'none' ? [] : value.split(' ');
      const y = Number.parseFloat(ty);
      if (Math.sign(toward - from) * (y - from) < by) {
        return null;
      }
      const box = card.getBoundingClientRect();
      return {x: box.left + box.width * 0.3, y: box.top + box.height / 2};
    },
    {from, toward, by},
    {polling: 'raf'},
  );
  const at = (await handle.jsonValue()) as {x: number; y: number};
  return {x: Math.round(at.x), y: Math.round(at.y)};
}

/** One finger's frames from `fromMs`, every frame, held at `at`. */
function hold(
  id: number,
  at: {x: number; y: number},
  fromMs: number,
  forMs: number,
): TouchFrame[] {
  const frames: TouchFrame[] = [];
  for (let t = fromMs; t <= fromMs + forMs; t += FRAME_MS) {
    frames.push({t: +t.toFixed(3), fingers: [{id, ...at}]});
  }
  return frames;
}

/** One finger's frames from `fromMs`, moving from `from` to `to` over `forMs`. */
function move(
  id: number,
  from: {x: number; y: number},
  to: {x: number; y: number},
  fromMs: number,
  forMs: number,
): TouchFrame[] {
  const frames: TouchFrame[] = [];
  const steps = Math.max(1, Math.round(forMs / FRAME_MS));
  for (let i = 1; i <= steps; i += 1) {
    const k = i / steps;
    frames.push({
      t: +(fromMs + (forMs * i) / steps).toFixed(3),
      fingers: [
        {
          id,
          x: Math.round(from.x + (to.x - from.x) * k),
          y: Math.round(from.y + (to.y - from.y) * k),
        },
      ],
    });
  }
  return frames;
}

/** The card's translates between two times, skipping frames without it. */
function between(frames: CardFrame[], fromMs: number, toMs: number): number[] {
  return frames
    .filter(frame => frame.t >= fromMs && frame.t <= toMs)
    .map(frame => frame.y)
    .filter((y): y is number => y != null);
}

function spread(values: number[]): number {
  return Math.max(...values) - Math.min(...values);
}

test('a finger catches a card that springs back where it shows, and the card follows the finger', async ({
  page,
}) => {
  const card = await showToast(page);
  const box = await card.boundingBox();
  if (box == null) {
    throw new Error('no toast');
  }
  const driver = await touchDriver(page);
  await recordCard(page);
  // A bottom toast. The finger moves 20 px toward its edge, so the swipe
  // begins. Then it turns back 140 px up and rests: the card stretches up,
  // and it springs back when the finger lifts.
  const start = {
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2),
  };
  const begun = {x: start.x, y: start.y + 20};
  const stretched = {x: start.x, y: start.y - 120};
  const first: TouchFrame[] = [
    {t: 0, fingers: [{id: 0, ...start}]},
    ...move(0, start, begun, 0, 60),
    ...move(0, begun, stretched, 60, 220),
    ...hold(0, stretched, 280 + FRAME_MS, 60),
  ];
  const lift = first[first.length - 1].t + FRAME_MS;
  await driver.play([...first, {t: +lift.toFixed(3), fingers: []}]);
  // Once the spring has moved the card 5 px back, a second touch lands on it.
  // It holds still, then moves 40 px toward the edge.
  const stretchedY = Math.min(
    ...between(
      (await readRecord(page)).__frames,
      Number.NEGATIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    ),
  );
  const catchAt = await waitForMotion(page, stretchedY, 0, 5);
  const moved = {x: catchAt.x, y: catchAt.y + 40};
  const second: TouchFrame[] = [
    ...hold(1, catchAt, 0, 150),
    ...move(1, catchAt, moved, 150, 160),
  ];
  await driver.play([
    ...second,
    {t: +(second[second.length - 1].t + FRAME_MS).toFixed(3), fingers: []},
  ]);
  const {__frames: frames, __touches: touches} = await readRecord(page);
  expect(touches, 'two touches landed').toHaveLength(2);
  const {down, firstMove, up} = touches[1];
  if (firstMove == null || up == null) {
    throw new Error('the second touch did not move and lift');
  }
  expect(
    spread(between(frames, down - 6 * FRAME_MS, down)),
    'the card springs back before the catch (px)',
  ).toBeGreaterThan(2);
  const held = between(frames, down + 2 * FRAME_MS, firstMove - FRAME_MS);
  expect(held.length, 'frames while the finger holds').toBeGreaterThan(4);
  expect(
    spread(held),
    'the card stays where the finger caught it (px)',
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(held[0]),
    'the finger caught it away from rest (px)',
  ).toBeGreaterThan(5);
  // The card follows the finger toward the edge at the follow ratio, past
  // the dead zone measured from where the finger landed.
  const followed = between(frames, up - 3 * FRAME_MS, up);
  expect(followed.length, 'frames at the end of the move').toBeGreaterThan(0);
  expect(
    Math.max(...followed) - held[0],
    'the card follows the finger toward its edge (px)',
  ).toBeGreaterThan(0.5 * TOAST.followRatio * (40 - TOAST.followFrom));
});

test('a finger catches a card on its way out where it shows, and the card leaves once the finger lifts', async ({
  page,
}) => {
  const card = await showToast(page);
  const box = await card.boundingBox();
  if (box == null) {
    throw new Error('no toast');
  }
  const driver = await touchDriver(page);
  await recordCard(page);
  // The close button starts the retract. Once the card has started to leave,
  // a finger lands on its text and holds still.
  await page
    .getByRole('button', {name: 'Dismiss notification'})
    .evaluate(element => (element as HTMLElement).click());
  const catchAt = await waitForMotion(page, 0, box.height, 2);
  const held = hold(0, catchAt, 0, 160);
  const script: TouchScript = [
    ...held,
    {t: +(held[held.length - 1].t + FRAME_MS).toFixed(3), fingers: []},
  ];
  await driver.play(script);
  const {__frames: frames, __touches: touches} = await readRecord(page);
  expect(touches, 'one touch landed').toHaveLength(1);
  const {down, up} = touches[0];
  if (up == null) {
    throw new Error('the touch did not lift');
  }
  const whileHeld = frames.filter(
    frame => frame.t >= down + 2 * FRAME_MS && frame.t <= up - FRAME_MS,
  );
  expect(
    whileHeld.every(frame => frame.y != null),
    'the card stays in the page while the finger holds it',
  ).toBe(true);
  const ys = whileHeld.map(frame => frame.y as number);
  expect(ys.length, 'frames while the finger holds').toBeGreaterThan(4);
  expect(
    spread(ys),
    'the card stays where the finger caught it (px)',
  ).toBeLessThanOrEqual(1);
  expect(ys[0], 'the card had started to leave (px)').toBeGreaterThan(0.5);
  // Its toast is dismissed, so the card leaves when the finger lifts.
  await expect(page.locator('.astryx-toast')).toHaveCount(0, {timeout: 3000});
});

test('a dismissal while a finger drags the card lets the card leave once the finger lifts', async ({
  page,
}) => {
  const card = await showToast(page);
  const box = await card.boundingBox();
  if (box == null) {
    throw new Error('no toast');
  }
  const driver = await touchDriver(page);
  // The close button dismisses the toast after the finger's third move,
  // while the finger drags the card.
  await page
    .getByRole('button', {name: 'Dismiss notification'})
    .evaluate(element => {
      let moves = 0;
      window.addEventListener(
        'touchmove',
        () => {
          moves += 1;
          if (moves === 3) {
            setTimeout(() => (element as HTMLElement).click(), 0);
          }
        },
        {capture: true, passive: true},
      );
    });
  // The finger drags the bottom toast 24 px toward its edge, then brings it
  // back to 4 px and rests. So the lift alone would not dismiss it.
  const start = {
    x: Math.round(box.x + box.width * 0.3),
    y: Math.round(box.y + box.height / 2),
  };
  const out = {x: start.x, y: start.y + 24};
  const back = {x: start.x, y: start.y + 4};
  const frames: TouchFrame[] = [
    {t: 0, fingers: [{id: 0, ...start}]},
    ...move(0, start, out, 0, 100),
    ...move(0, out, back, 100, 160),
    ...hold(0, back, 260 + FRAME_MS, 60),
  ];
  await driver.play([
    ...frames,
    {t: +(frames[frames.length - 1].t + FRAME_MS).toFixed(3), fingers: []},
  ]);
  // Its toast is dismissed, so the card leaves once the finger lifts.
  await expect(page.locator('.astryx-toast')).toHaveCount(0, {timeout: 3000});
});

test('under reduced motion, a drag that turns back fades the card back to rest once', async ({
  page,
}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  const card = await showToast(page);
  const box = await card.boundingBox();
  if (box == null) {
    throw new Error('no toast');
  }
  const driver = await touchDriver(page);
  // The card's opacity on every frame.
  await page.evaluate(() => {
    const recorder = window as unknown as {__opacity: number[]};
    recorder.__opacity = [];
    const tick = () => {
      const element = document.querySelector('.astryx-toast');
      if (element != null) {
        recorder.__opacity.push(
          Number.parseFloat(getComputedStyle(element).opacity),
        );
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  // The finger drags the bottom toast 20 px toward its edge, then 115 px back
  // past where it started. It rests and lifts, and the card springs back.
  const start = {
    x: Math.round(box.x + box.width * 0.3),
    y: Math.round(box.y + box.height / 2),
  };
  const out = {x: start.x, y: start.y + 20};
  const away = {x: start.x, y: start.y - 115};
  const frames: TouchFrame[] = [
    {t: 0, fingers: [{id: 0, ...start}]},
    ...move(0, start, out, 0, 100),
    ...move(0, out, away, 100, 300),
    ...hold(0, away, 400 + FRAME_MS, 60),
  ];
  await driver.play([
    ...frames,
    {t: +(frames[frames.length - 1].t + FRAME_MS).toFixed(3), fingers: []},
  ]);
  await page.waitForTimeout(1000);
  const opacity = await page.evaluate(
    () => (window as unknown as {__opacity: number[]}).__opacity,
  );
  // One fade: the card dips below full opacity once, then stays there.
  let fades = 0;
  let isLow = false;
  for (const value of opacity) {
    if (value < 0.95 && !isLow) {
      fades += 1;
    }
    isLow = value < 0.95;
  }
  expect(fades, 'the spring-back fades once').toBe(1);
  expect(opacity[opacity.length - 1]).toBe(1);
});

test('a finger that drags or catches the card starts no text selection; a still hold on a resting card still can', async ({
  page,
}) => {
  const card = await showToast(page);
  const box = await card.boundingBox();
  if (box == null) {
    throw new Error('no toast');
  }
  const driver = await touchDriver(page);
  await recordCard(page);
  // Each probe asks the card's text for a selection, as a long press does,
  // and records whether the card refused it.
  await page.evaluate(() => {
    const recorder = window as unknown as {__refused: Record<string, boolean>};
    recorder.__refused = {};
    const probe = (label: string) => {
      const element = document.querySelector('.astryx-toast');
      if (element == null) {
        return;
      }
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let text = walker.nextNode();
      while (text != null && (text.textContent ?? '').trim() === '') {
        text = walker.nextNode();
      }
      const event = new Event('selectstart', {bubbles: true, cancelable: true});
      (text?.parentElement ?? element).dispatchEvent(event);
      recorder.__refused[label] = event.defaultPrevented;
    };
    let touches = 0;
    let moves = 0;
    const options = {capture: true, passive: true};
    window.addEventListener(
      'touchstart',
      () => {
        touches += 1;
        moves = 0;
        const touch = touches;
        setTimeout(() => probe(`hold ${touch}`), 100);
      },
      options,
    );
    window.addEventListener(
      'touchmove',
      () => {
        moves += 1;
        if (moves === 8) {
          probe(`drag ${touches}`);
        }
      },
      options,
    );
    window.addEventListener(
      'touchend',
      () => {
        const touch = touches;
        setTimeout(() => probe(`after ${touch}`), 30);
      },
      options,
    );
  });
  const start = {
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2),
  };
  // First a still hold on the resting card.
  await driver.play([
    ...hold(0, start, 0, 300),
    {t: 300 + FRAME_MS, fingers: []},
  ]);
  // Then a drag: 20 px toward the edge, so the swipe claims the touch, then
  // 140 px back. The card stretches and springs back at the lift.
  const begun = {x: start.x, y: start.y + 20};
  const stretched = {x: start.x, y: start.y - 120};
  const drag: TouchFrame[] = [
    {t: 0, fingers: [{id: 1, ...start}]},
    ...move(1, start, begun, 0, 60),
    ...move(1, begun, stretched, 60, 220),
    ...hold(1, stretched, 280 + FRAME_MS, 60),
  ];
  await driver.play([
    ...drag,
    {t: +(drag[drag.length - 1].t + FRAME_MS).toFixed(3), fingers: []},
  ]);
  // Then a finger catches the springing card and holds it.
  const stretchedY = Math.min(
    ...between(
      (await readRecord(page)).__frames,
      Number.NEGATIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    ),
  );
  const catchAt = await waitForMotion(page, stretchedY, 0, 5);
  await driver.play([
    ...hold(2, catchAt, 0, 300),
    {t: 300 + FRAME_MS, fingers: []},
  ]);
  await page.waitForTimeout(100);
  const refused = await page.evaluate(
    () => (window as unknown as {__refused: Record<string, boolean>}).__refused,
  );
  expect(refused['hold 1'], 'a still hold on a resting card can select').toBe(
    false,
  );
  expect(refused['drag 2'], 'a drag starts no selection').toBe(true);
  expect(refused['after 2'], 'the lift lets selection start again').toBe(false);
  expect(
    refused['hold 3'],
    'a finger that catches the card starts no selection',
  ).toBe(true);
  expect(refused['after 3'], 'the lift lets selection start again').toBe(false);
});

test('a card caught by a finger whose lift the page never hears leaves after a tap on its close button', async ({
  page,
}) => {
  // The page never hears the second finger lift: its touchend and pointerup
  // stop at the window before the app's own listeners, added first.
  await page.addInitScript(() => {
    let touches = 0;
    let second: number | null = null;
    window.addEventListener(
      'touchstart',
      event => {
        for (const touch of Array.from(event.changedTouches)) {
          touches += 1;
          if (touches === 2) {
            second = touch.identifier;
          }
        }
      },
      {capture: true},
    );
    window.addEventListener(
      'touchend',
      event => {
        if (
          Array.from(event.changedTouches).some(
            touch => touch.identifier === second,
          )
        ) {
          event.stopImmediatePropagation();
        }
      },
      {capture: true},
    );
    let pointers = 0;
    let secondPointer: number | null = null;
    window.addEventListener(
      'pointerdown',
      event => {
        pointers += 1;
        if (pointers === 2) {
          secondPointer = event.pointerId;
        }
      },
      {capture: true},
    );
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      window.addEventListener(
        type,
        event => {
          if ((event as PointerEvent).pointerId === secondPointer) {
            event.stopImmediatePropagation();
          }
        },
        {capture: true},
      );
    }
  });
  const card = await showToast(page);
  const box = await card.boundingBox();
  if (box == null) {
    throw new Error('no toast');
  }
  const driver = await touchDriver(page);
  // A flick toward the bottom edge dismisses the toast, and a second finger
  // catches the leaving card.
  const start = {
    x: Math.round(box.x + box.width * 0.3),
    y: Math.round(box.y + box.height / 2),
  };
  const flicked = {x: start.x, y: start.y + 40};
  const flick: TouchFrame[] = [
    {t: 0, fingers: [{id: 0, ...start}]},
    ...move(0, start, flicked, 0, 50),
  ];
  await driver.play([
    ...flick,
    {t: +(flick[flick.length - 1].t + FRAME_MS).toFixed(3), fingers: []},
  ]);
  const caught = {x: start.x, y: start.y + 8};
  await driver.play([
    ...hold(1, caught, 0, 150),
    {t: 150 + FRAME_MS, fingers: []},
  ]);
  await page.waitForTimeout(300);
  await expect(card, 'the card stays caught').toBeVisible();
  // The tap on its close button tells the page that finger is gone.
  const close = page.getByRole('button', {name: 'Dismiss notification'});
  const closeBox = await close.boundingBox();
  if (closeBox == null) {
    throw new Error('no close button');
  }
  const tap = {
    x: Math.round(closeBox.x + closeBox.width / 2),
    y: Math.round(closeBox.y + closeBox.height / 2),
  };
  await driver.play([
    {t: 0, fingers: [{id: 2, ...tap}]},
    {t: 60, fingers: []},
  ]);
  await expect(page.locator('.astryx-toast')).toHaveCount(0, {timeout: 3000});
});

test('a tap on the card during its entrance leaves the entrance running', async ({
  page,
}) => {
  await openStory(page, storybook(), 'core-toast--error-persists');
  // A slow entrance, so that the tap lands while the card still fades in.
  await page.addStyleTag({
    content: '.astryx-toast { transition-duration: 2s !important; }',
  });
  await page
    .getByRole('button', {name: 'Trigger error'})
    .evaluate(element => (element as HTMLElement).click());
  const card = page.locator('.astryx-toast').first();
  await expect(card).toBeVisible();
  await page.waitForTimeout(200);
  const box = await card.boundingBox();
  if (box == null) {
    throw new Error('no toast');
  }
  const driver = await touchDriver(page);
  const at = {
    x: Math.round(box.x + box.width * 0.3),
    y: Math.round(box.y + box.height / 2),
  };
  await driver.play([
    {t: 0, fingers: [{id: 0, ...at}]},
    {t: 60, fingers: []},
  ]);
  // The tap moved nothing, so the card keeps fading in.
  const opacity = await card.evaluate(element =>
    Number.parseFloat(getComputedStyle(element).opacity),
  );
  expect(opacity, 'the card still fades in').toBeLessThan(0.9);
  await expect(card).toHaveCSS('opacity', '1', {timeout: 5000});
});
