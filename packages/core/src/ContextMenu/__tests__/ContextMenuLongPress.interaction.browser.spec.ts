// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ContextMenuLongPress.interaction.browser.spec.ts
 * @input The built "Touch / long press" ContextMenu story, real touch input,
 *   the interaction harness, the context-menu constants and UIKit's frames
 * @output Interaction and animation proofs for a context menu that a held
 *   finger opens on UIKit's timeline. They cover the menu's moments, the
 *   press feedback against UIKit's frames and a blocked main thread. They
 *   also cover the page under the finger, a pan outside and a storyboard of
 *   the press
 * @position Interaction specs of packages/core/src/ContextMenu; Chromium's
 *   finger stands for Android's engine, and WebKit's for iOS
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  blockMainThread,
  busyWindowProof,
  castStoryboard,
  countBetween,
  drag,
  FRAME_STARVATION_MS,
  FrameStarvationError,
  freezeTimers,
  holdAnimations,
  installInputLog,
  installLongTaskLog,
  installTimerGate,
  markElement,
  merge,
  openStory,
  PEN_SKIP,
  readInputLog,
  releaseAnimations,
  startScreencast,
  tap,
  thawTimers,
  timeline,
  touchDriver,
  trackMarker,
  traceRendering,
  waitForAnimation,
  webInputDriver,
  withFinger,
  withStorybook,
  writeEvidence,
  animationStoryboard,
  type TouchDriver,
} from '@astryxdesign/interaction-harness';
import {solveSpring, toSpring} from '../../motion/spring';
import {contextMenu} from '../../motion/uikit/contextMenu';
import {springs} from '../../motion/uikit/springs';

const storybook = withStorybook(test);
const {commitMs, menuDisplayMs, heldScale} = contextMenu.press;
// The growth starts at the onset, 150 ms after the finger lands
// (`PRESS_ONSET_MS` in `utils/pressGesture.ts`). That module loads a StyleX
// stylesheet, which this Node-side spec cannot, so the onset is restated here.
const feedbackOnsetMs = 150;

/** The growth's expected curve: `springs.contextMenuLift` from 1 to the held scale. */
function playedCurve() {
  const curve = solveSpring(toSpring(springs.contextMenuLift), {
    from: 1,
    to: heldScale,
  });
  return {at: (t: number) => curve.value(Math.max(0, t))};
}

interface TouchStory {
  driver: TouchDriver;
  trigger: Locator;
  center: {x: number; y: number};
}

/** The touch story under the engine's own finger (a coarse pointer). */
async function openTouchStory(
  page: Page,
  story = 'core-contextmenu--touch-long-press',
): Promise<TouchStory> {
  await installInputLog(page);
  await installLongTaskLog(page);
  // Note when the menu is asked to show, on the page clock (no per-frame
  // work: rendering proofs share this page).
  await page.addInitScript(() => {
    const w = window as unknown as {
      __menuShownAt?: number | null;
      __liftHandledAt?: number | null;
      __menuShownInLift?: boolean | null;
      __menuShownTimerAt?: number | null;
    };
    w.__menuShownAt = null;
    w.__liftHandledAt = null;
    w.__menuShownInLift = null;
    w.__menuShownTimerAt = null;
    let isInLift = false;
    // When the timer task that runs now started. The hold's moments come from
    // the gesture arena's timers. The menu commits in the task that decides
    // it, so its show runs inside that timer task.
    let timerAt: number | null = null;
    const setTimer = window.setTimeout;
    window.setTimeout = ((
      handler: TimerHandler,
      timeout?: number,
      ...args: unknown[]
    ) =>
      setTimer(
        (...callArgs: unknown[]) => {
          const outer = timerAt;
          timerAt = performance.now();
          try {
            if (typeof handler === 'function') {
              handler(...callArgs);
            }
          } finally {
            timerAt = outer;
          }
        },
        timeout,
        ...args,
      )) as typeof window.setTimeout;
    // When the page gets to the lift. The event's own timestamp is the
    // hardware's, or the script's. Also whether the menu shows while the
    // lift's listeners run: then no frame paints between the two.
    addEventListener(
      'touchend',
      () => {
        w.__liftHandledAt = performance.now();
        isInLift = true;
        // Added during the dispatch, it runs after the page's own listeners.
        addEventListener(
          'touchend',
          () => {
            isInLift = false;
          },
          {once: true, passive: true},
        );
      },
      {capture: true, passive: true},
    );
    const show = HTMLElement.prototype.showPopover;
    HTMLElement.prototype.showPopover = function (
      this: HTMLElement,
      ...args: Parameters<typeof show>
    ) {
      // Only a popover that holds the menu (Storybook shows its own).
      if (
        this.matches('[role="menu"]') ||
        this.querySelector('[role="menu"]') != null
      ) {
        // Only the first show counts, so a later one cannot stand in for it.
        if (w.__menuShownAt == null) {
          w.__menuShownAt = performance.now();
          w.__menuShownInLift = isInLift;
          w.__menuShownTimerAt = timerAt;
        }
      }
      return show.apply(this, args);
    };
  });
  await openStory(page, storybook(), story);
  const driver = await touchDriver(page);
  const trigger = page.getByTestId('touch-context-menu');
  const box = await trigger.boundingBox();
  if (box == null) {
    throw new Error('no trigger');
  }
  return {
    driver,
    trigger,
    center: {x: box.x + box.width / 2, y: box.y + box.height / 2},
  };
}

/** When the timer task that showed the menu started, or null outside one. */
const menuShownTimerAt = async (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as {__menuShownTimerAt?: number | null})
        .__menuShownTimerAt ?? null,
  );

const menuShownAt = async (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as {__menuShownAt?: number | null}).__menuShownAt ??
      null,
  );

/** The page-clock timestamp of the last `type` event. */
async function lastInput(
  page: Page,
  type: 'touchstart' | 'touchend',
): Promise<number> {
  const log = await readInputLog(page);
  const record = log.filter(entry => entry.type === type).at(-1);
  if (record == null) {
    throw new Error(`no ${type} reached the page`);
  }
  return record.timeStamp;
}

const touchStartedAt = async (page: Page) => lastInput(page, 'touchstart');

/** Waits until the page clock is `ms` past the last touch's start. */
async function untilSinceTouch(page: Page, ms: number) {
  await expect
    .poll(async () =>
      (await readInputLog(page)).some(entry => entry.type === 'touchstart'),
    )
    .toBe(true);
  const start = await touchStartedAt(page);
  await page.waitForFunction(dueAt => performance.now() >= dueAt, start + ms);
}

/**
 * Waits until the menu's moment has passed on the page clock, then one task
 * more, so a timer that is due runs first.
 */
async function untilMenuMomentPassed(page: Page) {
  await untilSinceTouch(page, menuDisplayMs + 100);
  await page.evaluate(
    async () =>
      new Promise<void>(resolve => {
        setTimeout(resolve, 0);
      }),
  );
}

/** Waits until the lift reaches the page, then a frame and one task more. */
async function untilAfterLift(page: Page) {
  await expect
    .poll(async () =>
      (await readInputLog(page)).some(entry => entry.type === 'touchend'),
    )
    .toBe(true);
  await page.evaluate(
    async () =>
      new Promise<void>(resolve => {
        requestAnimationFrame(() => {
          setTimeout(resolve, 0);
        });
      }),
  );
}

/** The trigger's own visual: the press feedback grows it, not the trigger. */
const visualOf = (trigger: Locator) => trigger.locator(':scope > div').first();

/** The press feedback's presented scale, read on the trigger's visual. */
const presentedScale = async (trigger: Locator) =>
  visualOf(trigger).evaluate(element => {
    const scale = getComputedStyle(element).scale;
    return scale === 'none' ? 1 : Number.parseFloat(scale);
  });

/** A finger held still for `ms`, then lifted. */
const hold = (at: {x: number; y: number}, ms: number) => tap(at, {holdMs: ms});

/** One frame at 60 Hz, ms. */
const FRAME_MS = 1000 / 60;

/** Logs when each frame's callbacks run, on the page clock, until read. */
async function startFrameLog(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as {__frameLog?: number[]};
    const log: number[] = [];
    w.__frameLog = log;
    const tick = () => {
      log.push(performance.now());
      if (w.__frameLog === log) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  });
}

/** Stops the frame log and reads it. */
async function readFrameLog(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const w = window as unknown as {__frameLog?: number[]};
    const log = w.__frameLog ?? [];
    w.__frameLog = undefined;
    return log;
  });
}

/**
 * The timer task that decides the menu starts within a frame of its due
 * time. A later start fails by name when the page was starved of frames.
 * Then a gap over `FRAME_STARVATION_MS` held the due time, and the task ran
 * within two frames of its end. Any other late start fails bare, because
 * something on the page held the timer while frames ran.
 */
function expectDecidedOnTime(
  frames: ReadonlyArray<number>,
  dueAt: number,
  startedAt: number,
) {
  const lateMs = startedAt - dueAt;
  if (lateMs <= FRAME_MS) {
    return;
  }
  let longestGapMs = 0;
  for (let i = 1; i < frames.length; i++) {
    const holdsDueTime = frames[i - 1] <= dueAt + FRAME_MS && frames[i] > dueAt;
    // After a long task the browser may draw a frame before the late timer.
    const ranAfterIt = startedAt - frames[i] <= 2 * FRAME_MS;
    if (holdsDueTime && ranAfterIt) {
      longestGapMs = Math.max(longestGapMs, frames[i] - frames[i - 1]);
    }
  }
  if (longestGapMs > FRAME_STARVATION_MS) {
    throw new FrameStarvationError({
      during: `the menu's timer task was due, and it started ${lateMs.toFixed(1)} ms late`,
      frames: frames.filter(t => t > dueAt && t < startedAt).length,
      min: Math.max(1, Math.floor(lateMs / FRAME_MS)),
      longestGapMs,
    });
  }
  expect(
    lateMs,
    'the timer task that decides the menu started late while frames ran',
  ).toBeLessThanOrEqual(FRAME_MS);
}

test('a finger still down gets the menu at 735 ms (iOS 26.2), not before', async ({
  page,
}) => {
  const {driver, center} = await openTouchStory(page);
  await startFrameLog(page);
  await driver.play(hold(center, menuDisplayMs + 200));
  const frames = await readFrameLog(page);
  const start = await touchStartedAt(page);
  const shown = await menuShownAt(page);
  const decided = await menuShownTimerAt(page);
  expect(shown, 'the menu never showed').not.toBeNull();
  // The menu commits in the timer task that decides it. That task runs at
  // the deadline, which counts from the touch's own timestamp.
  expect(
    decided,
    'the menu showed after the task that decided it',
  ).not.toBeNull();
  expect((decided as number) - start).toBeGreaterThanOrEqual(menuDisplayMs - 1);
  expectDecidedOnTime(frames, start + menuDisplayMs, decided as number);
  const after = (shown as number) - start;
  // The timer runs at its deadline, give or take a task.
  expect(after).toBeGreaterThanOrEqual(menuDisplayMs);
  expect(after).toBeLessThan(menuDisplayMs + 20);
  await expect(page.getByRole('menu', {name: 'Photo actions'})).toBeVisible();
});

/** The press counts a move as late when it reaches the page this long after its own time. */
const LATE_INPUT_MS = 33;
/** How long the press waits after a late move that reached the page just before the menu's moment. */
const LATE_MOVE_GAP_MS = 50;

/** A hold that shifts 3 px once, as the page read it, on the page clock. */
interface ShiftedHold {
  start: number;
  /** The shift's own time and when the page got it. */
  shift: [number, number];
  frames: number[];
  shown: number | null;
  decided: number | null;
}

/**
 * A finger held still that shifts 3 px once, then lifts at 1000 ms. In
 * Chromium the page reads the timestamp the protocol hands over, so the shift
 * leaves at `sentMs` stamped `stampMs`, and the case sets how late the page
 * gets it. WebKit stamps a touch as it arrives, so there the shift leaves at
 * `sentMs`.
 */
async function holdWithShift(
  page: Page,
  browserName: string,
  {sentMs, stampMs}: {sentMs: number; stampMs: number},
): Promise<ShiftedHold> {
  await page.addInitScript(() => {
    const w = window as unknown as {__shifts: [number, number][]};
    w.__shifts = [];
    window.addEventListener(
      'pointermove',
      event => {
        w.__shifts.push([event.timeStamp, performance.now()]);
      },
      {capture: true, passive: true},
    );
  });
  const {driver, center} = await openTouchStory(page);
  await startFrameLog(page);
  if (browserName === 'chromium') {
    const cdp = await page.context().newCDPSession(page);
    const origin = Date.now();
    const at = async (ms: number) =>
      new Promise(resolve => {
        setTimeout(resolve, Math.max(0, origin + ms - Date.now()));
      });
    const touch = async (
      type: 'touchStart' | 'touchMove' | 'touchEnd',
      ms: number,
      dx: number | null,
    ) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: dx == null ? [] : [{x: center.x + dx, y: center.y}],
        timestamp: (origin + ms) / 1000,
      });
    await touch('touchStart', 0, 0);
    await at(sentMs);
    await touch('touchMove', stampMs, 3);
    await at(1000);
    await touch('touchEnd', 1000, null);
  } else {
    await driver.play(
      drag(
        center,
        {x: center.x + 3, y: center.y},
        {holdMs: sentMs - 1, durationMs: 1, restMs: 1000 - sentMs},
      ),
    );
  }
  const frames = await readFrameLog(page);
  const start = await touchStartedAt(page);
  const shifts = await page.evaluate(
    () => (window as unknown as {__shifts: [number, number][]}).__shifts,
  );
  expect(shifts.length, 'the shift reached the page').toBeGreaterThan(0);
  return {
    start,
    shift: shifts[shifts.length - 1],
    frames,
    shown: await menuShownAt(page),
    decided: await menuShownTimerAt(page),
  };
}

/** The shift reached the page before the menu's moment, inside the press's wait. */
function expectShiftInsideWait(
  [, receivedAt]: [number, number],
  moment: number,
) {
  expect(
    receivedAt,
    'the shift reached the page before the menu’s moment',
  ).toBeLessThan(moment);
  expect(
    moment - receivedAt,
    'the shift reached the page inside the press’s wait before the moment',
  ).toBeLessThan(LATE_MOVE_GAP_MS);
}

test('a finger that shifts slightly just before 735 ms gets the menu at 735 ms when its move reaches the page on time (AST-094 FR12)', async ({
  page,
  browserName,
}) => {
  // A phone gets a move within a frame. The protocol's own path can take two
  // frames on a test machine, so the shift leaves 25 ms ahead of its stamp.
  // A faster path brings it before its stamp: the press counts that negative
  // lag as on time, as any lag up to 33 ms. Leaving at 688 ms, it reaches the
  // page less than 50 ms before the moment, and before it on any path under
  // 47 ms.
  const run = await holdWithShift(page, browserName, {
    sentMs: 688,
    stampMs: 713,
  });
  const moment = run.start + menuDisplayMs;
  expectShiftInsideWait(run.shift, moment);
  expect(
    run.shift[1] - run.shift[0],
    'the shift reached the page on time',
  ).toBeLessThanOrEqual(LATE_INPUT_MS);
  expect(run.shown, 'the menu never showed').not.toBeNull();
  // The moment's own timer task shows the menu: nothing waits.
  expect(
    run.decided,
    'the menu showed after the task that decided it',
  ).not.toBeNull();
  expectDecidedOnTime(run.frames, moment, run.decided as number);
  const after = (run.shown as number) - run.start;
  expect(after).toBeGreaterThanOrEqual(menuDisplayMs);
  expect(after).toBeLessThan(menuDisplayMs + 20);
});

test('a finger that shifts slightly just before 735 ms gets the menu 50 ms later when its move reaches the page late (AST-094 FR12)', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'a touch stamped before it is sent needs Chromium’s protocol',
  );
  // The shift leaves 60 ms after its stamp, so the page gets it late.
  const run = await holdWithShift(page, browserName, {
    sentMs: 688,
    stampMs: 628,
  });
  const moment = run.start + menuDisplayMs;
  expectShiftInsideWait(run.shift, moment);
  expect(
    run.shift[1] - run.shift[0],
    'the shift reached the page late',
  ).toBeGreaterThan(LATE_INPUT_MS);
  expect(run.decided, 'the menu never showed').not.toBeNull();
  expect(
    (run.decided as number) - moment,
    'the menu waited for moves still coming late',
  ).toBeGreaterThanOrEqual(LATE_MOVE_GAP_MS - 1);
  await expect(page.getByRole('menu', {name: 'Photo actions'})).toBeVisible();
});

test('the menu mounts at the commit, closed and out of the accessibility tree, and shows at 735 ms', async ({
  page,
}) => {
  const {driver, center} = await openTouchStory(page);
  const playing = driver.play(hold(center, menuDisplayMs + 200));
  const prepared = page
    .locator('[popover]')
    .filter({has: page.locator('[role="menu"]')});
  // Mounted at the commit (400 ms), well before the menu's moment (735 ms).
  await expect(prepared).toHaveCount(1, {timeout: 700});
  expect(await menuShownAt(page), 'the menu showed before 735 ms').toBeNull();
  expect(await prepared.evaluate(el => el.matches(':popover-open'))).toBe(
    false,
  );
  await expect(page.getByRole('menu', {name: 'Photo actions'})).toHaveCount(0);
  await playing;
  await expect(page.getByRole('menu', {name: 'Photo actions'})).toBeVisible();
});

test('with presentation="popover" a finger keeps today’s long press: the menu at 500 ms, with no growth and no iOS timeline', async ({
  page,
}) => {
  const {driver, trigger, center} = await openTouchStory(
    page,
    'core-contextmenu--touch-long-press-popover',
  );
  // A coarse primary pointer: only the caller's choice keeps today's menu.
  expect(
    await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
  ).toBe(true);
  expect(await trigger.getAttribute('data-astryx-pressable')).toBeNull();
  const playing = driver.play(hold(center, 1000));
  await untilSinceTouch(page, 350);
  const scaleBeforeOpen = await presentedScale(trigger);
  // Still held: the menu is up. At the lift, emulated Chromium sends
  // compatibility mouse events that a device sends no click for. They dismiss
  // today's menu. The touch model's recognizer claims the finger instead.
  await expect(page.getByRole('menu', {name: 'Photo actions'})).toBeVisible({
    timeout: 550,
  });
  await playing;
  const start = await touchStartedAt(page);
  const shown = await menuShownAt(page);
  expect(shown, 'the menu never showed').not.toBeNull();
  const after = (shown as number) - start;
  // Today's 500 ms, give or take a task and the render that shows the menu;
  // far from the touch model's 735 ms.
  expect(after).toBeGreaterThanOrEqual(500);
  expect(after).toBeLessThan(550);
  expect(scaleBeforeOpen).toBe(1);
});

test('a finger where the primary pointer is fine keeps today’s long press: the menu at 500 ms, with no growth', async ({
  browser,
  page,
}) => {
  // A touch screen whose primary pointer is fine (a laptop with a trackpad).
  const context = await browser.newContext({
    viewport: page.viewportSize() ?? {width: 402, height: 874},
    hasTouch: true,
    isMobile: false,
  });
  const fine = await context.newPage();
  try {
    await installInputLog(fine);
    await openStory(fine, storybook(), 'core-contextmenu--touch-long-press');
    const coarse = await fine.evaluate(
      () => matchMedia('(pointer: coarse)').matches,
    );
    test.skip(
      coarse,
      'this engine reports a coarse primary pointer whenever touch is emulated; the fine-primary finger is covered in jsdom',
    );
    const trigger = fine.getByTestId('touch-context-menu');
    const box = await trigger.boundingBox();
    if (box == null) {
      throw new Error('no trigger');
    }
    expect(await trigger.getAttribute('data-astryx-pressable')).toBeNull();
    const driver = await touchDriver(fine);
    const center = {x: box.x + box.width / 2, y: box.y + box.height / 2};
    const playing = driver.play(hold(center, 1000));
    await untilSinceTouch(fine, 350);
    const scaleBeforeOpen = await presentedScale(trigger);
    await expect(fine.getByRole('menu', {name: 'Photo actions'})).toBeVisible({
      timeout: 550,
    });
    await playing;
    expect(scaleBeforeOpen).toBe(1);
  } finally {
    await context.close();
  }
});

test('under Reduce Motion the card does not grow, and the menu still opens at 735 ms', async ({
  page,
}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  const {driver, trigger, center} = await openTouchStory(page);
  const playing = driver.play(hold(center, menuDisplayMs + 200));
  // Sampled while the finger is down: before the commit, after it, and just
  // before the menu.
  const scales: number[] = [];
  for (const at of [300, 550, 650]) {
    await untilSinceTouch(page, at);
    scales.push(await presentedScale(trigger));
  }
  await playing;
  const start = await touchStartedAt(page);
  const shown = await menuShownAt(page);
  const decided = await menuShownTimerAt(page);
  expect(scales).toEqual([1, 1, 1]);
  expect(
    await visualOf(trigger).evaluate(el => el.getAnimations().length),
  ).toBe(0);
  expect(shown, 'the menu never showed').not.toBeNull();
  expect(
    decided,
    'the menu showed after the task that decided it',
  ).not.toBeNull();
  expect((decided as number) - start).toBeGreaterThanOrEqual(menuDisplayMs - 1);
  const after = (shown as number) - start;
  // The touch's stamp and the page clock are each coarsened (0.1 ms).
  expect(after).toBeGreaterThanOrEqual(menuDisplayMs - 0.5);
  expect(after).toBeLessThan(menuDisplayMs + 20);
  await expect(page.getByRole('menu', {name: 'Photo actions'})).toBeVisible();
});

test('the trigger’s selection and callout lock: its own style keeps it off at rest, and the gesture host refuses a selection for a held press', async ({
  page,
}) => {
  const {driver, trigger, center} = await openTouchStory(page);
  // WebKit spells it `-webkit-user-select` only.
  const readLock = async () =>
    trigger.evaluate(el => {
      const host = el as HTMLElement;
      const computed = getComputedStyle(host);
      return {
        inline:
          host.style.getPropertyValue('user-select') ||
          host.style.getPropertyValue('-webkit-user-select'),
        computed:
          computed.getPropertyValue('user-select') ||
          computed.getPropertyValue('-webkit-user-select'),
      };
    });
  // Off iOS, the host's lock refuses a selection that starts on the element.
  const refusesSelection = async () =>
    trigger.evaluate(el => {
      const event = new Event('selectstart', {bubbles: true, cancelable: true});
      el.dispatchEvent(event);
      return event.defaultPrevented;
    });
  // At rest the trigger's own style keeps selection off (spec:AST-017
  // FR59), and nothing refuses a selection.
  const rest = await readLock();
  expect(rest.computed).toBe('none');
  expect(await refusesSelection()).toBe(false);
  // A held finger, short of the commit: the host's lock refuses a selection.
  const playing = driver.play(hold(center, commitMs - 100));
  await untilSinceTouch(page, commitMs / 2);
  const heldRefuses = await refusesSelection();
  const held = await readLock();
  await playing;
  await untilAfterLift(page);
  // Lifted with no menu: back to the rest state.
  const liftedRefuses = await refusesSelection();
  const lifted = await readLock();
  expect(heldRefuses).toBe(true);
  expect(held.computed).toBe('none');
  expect(liftedRefuses).toBe(false);
  expect(lifted).toEqual(rest);
  expect(
    await page.getByRole('menu', {name: 'Photo actions'}).isVisible(),
  ).toBe(false);
});

test('a touch open lights no row: the menu itself takes the focus, and every row keeps its resting background', async ({
  page,
}) => {
  const {driver, center} = await openTouchStory(page);
  const playing = driver.play(hold(center, menuDisplayMs + 300));
  const menu = page.getByRole('menu', {name: 'Photo actions'});
  await expect(menu).toBeVisible();
  // The focus moves on the frame after the menu shows.
  await page.evaluate(
    async () =>
      new Promise<void>(resolve => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }),
  );
  await expect(menu).toBeFocused();
  // An internal focus target: no browser ring on it.
  expect(await menu.evaluate(el => getComputedStyle(el).outlineStyle)).toBe(
    'none',
  );
  const backgrounds = await menu
    .getByRole('menuitem')
    .evaluateAll(rows =>
      rows.map(row => getComputedStyle(row).backgroundColor),
    );
  expect(new Set(backgrounds).size).toBe(1);
  await playing;
});

test('a finger lifted after the commit gets the menu at the lift, and sends no click', async ({
  page,
}) => {
  const {driver, center} = await openTouchStory(page);
  await driver.play(hold(center, 530));
  await expect(page.getByRole('menu', {name: 'Photo actions'})).toBeVisible();
  const {lift, shown, isInLift} = await page.evaluate(() => {
    const w = window as unknown as {
      __menuShownAt?: number | null;
      __liftHandledAt?: number | null;
      __menuShownInLift?: boolean | null;
    };
    return {
      lift: w.__liftHandledAt ?? null,
      shown: w.__menuShownAt ?? null,
      isInLift: w.__menuShownInLift ?? null,
    };
  });
  expect(lift).not.toBeNull();
  expect(shown).not.toBeNull();
  // In the lift's own dispatch: after it, and before the next frame could
  // paint, however long the menu's render takes in that task.
  expect((shown as number) - (lift as number)).toBeGreaterThanOrEqual(0);
  expect(isInLift).toBe(true);
  const log = await readInputLog(page);
  const end = log.filter(record => record.type === 'touchend').at(-1);
  expect(end?.defaultPrevented, JSON.stringify(log)).toBe(true);
  expect(log.filter(record => record.type === 'click')).toEqual([]);
});

test('the lift after the menu shows keeps it open and sends no click', async ({
  page,
}) => {
  const {driver, center} = await openTouchStory(page);
  await driver.play(hold(center, menuDisplayMs + 150));
  await untilAfterLift(page);
  await expect(page.getByRole('menu', {name: 'Photo actions'})).toBeVisible();
  const log = await readInputLog(page);
  expect(log.filter(record => record.type === 'click')).toEqual([]);
});

/** Polls until no animation runs on the menu's popover or inside it. */
async function untilMenuSettled(page: Page) {
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const surfaces = Array.from(
            document.querySelectorAll('[popover]'),
          ).filter(popover => popover.querySelector('[role="menu"]') != null);
          return document.getAnimations().filter(animation => {
            const target =
              animation.effect instanceof KeyframeEffect
                ? animation.effect.target
                : null;
            return (
              target != null &&
              animation.playState === 'running' &&
              surfaces.some(
                surface => surface === target || surface.contains(target),
              )
            );
          }).length;
        }),
      {timeout: 4000},
    )
    .toBe(0);
}

/** The open menu's box on screen, with any transform on its layer. */
const menuBox = async (page: Page) =>
  page.evaluate(() => {
    const list = document
      .querySelector('[role="menu"]')
      ?.getBoundingClientRect();
    return list == null ? null : {x: list.x, y: list.y};
  });

/**
 * The open menu's box and computed transform. Also every element from the
 * cursor anchor up that carries a transform, and the anchor's inline
 * geometry.
 */
async function readMenuPlacement(page: Page) {
  return page.evaluate(() => {
    const trigger = document.querySelector<HTMLElement>(
      '[data-testid="touch-context-menu"]',
    );
    const anchor = trigger?.lastElementChild as HTMLElement | null;
    const surface =
      document
        .querySelector('[role="menu"]')
        ?.closest<HTMLElement>('[popover]') ?? null;
    const transformed: string[] = [];
    for (let el: Element | null = anchor; el != null; el = el.parentElement) {
      const style = getComputedStyle(el);
      const scales = style.scale === 'none' ? [] : style.scale.split(' ');
      if (
        style.transform !== 'none' ||
        scales.some(value => Number.parseFloat(value) !== 1) ||
        (style.translate !== 'none' && style.translate !== '0px')
      ) {
        const name = el === trigger ? 'trigger' : el.tagName.toLowerCase();
        transformed.push(
          `${name}: scale ${style.scale}, translate ${style.translate}, transform ${style.transform}`,
        );
      }
    }
    const box = surface?.getBoundingClientRect();
    return {
      menu:
        box == null
          ? null
          : {x: box.x, y: box.y, width: box.width, height: box.height},
      transform: surface == null ? null : getComputedStyle(surface).transform,
      transformed,
      anchorGeometry:
        anchor == null
          ? null
          : ['scale', 'translate', 'transform', 'transform-origin'].filter(
              property => anchor.style.getPropertyValue(property) !== '',
            ),
    };
  });
}

/** The largest scale on the trigger or inside it: the press's growth. */
async function grownScale(trigger: Locator) {
  return trigger.evaluate(root =>
    Math.max(
      ...[root, ...root.querySelectorAll('*')].map(el => {
        const scale = getComputedStyle(el).scale;
        return scale === 'none' ? 1 : Number.parseFloat(scale);
      }),
    ),
  );
}

for (const input of ['finger', 'pen'] as const) {
  test(`a ${input}’s press grows only the trigger’s visual: the open menu matches an unpressed open, and nothing above its anchor is transformed (layer-runtime INV22)`, async ({
    page,
  }) => {
    const {driver, trigger} = await openTouchStory(page);
    const pen = input === 'pen' ? await webInputDriver(page) : null;
    test.skip(pen != null && !pen.pens, PEN_SKIP);
    const box = await trigger.boundingBox();
    if (box == null) {
      throw new Error('no trigger');
    }
    // Near the far corner, where a scaled anchor would land furthest off.
    const p = {
      x: Math.round(box.x + box.width * 0.9),
      y: Math.round(box.y + box.height * 0.85),
    };
    const menu = page.getByRole('menu', {name: 'Photo actions'});
    // Held well past the menu's moment, so the first read is inside the
    // press.
    const holdMs = menuDisplayMs + 1500;
    const playing =
      pen == null
        ? driver.play(hold(p, holdMs))
        : pen.pen([
            {...p, t: 0},
            {...p, t: holdMs},
          ]);
    await expect(menu).toBeVisible();
    await untilMenuSettled(page);
    const during = await readMenuPlacement(page);
    const grown = await grownScale(trigger);
    await playing;
    await untilMenuSettled(page);
    const after = await readMenuPlacement(page);
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect.poll(async () => grownScale(trigger), {timeout: 3000}).toBe(1);
    // Unpressed: a mouse opens the menu at the same point.
    await page.mouse.click(p.x, p.y, {button: 'right'});
    await expect(menu).toBeVisible();
    await untilMenuSettled(page);
    const unpressed = await readMenuPlacement(page);
    const detail = JSON.stringify({p, grown, during, after, unpressed});
    expect(grown, detail).toBeGreaterThan(1);
    expect(unpressed.menu, detail).not.toBeNull();
    for (const read of [during, after]) {
      expect(read.transformed, detail).toEqual([]);
      expect(read.anchorGeometry, detail).toEqual([]);
      expect(read.transform, detail).toBe(unpressed.transform);
      expect(read.menu?.x, detail).toBeCloseTo(unpressed.menu?.x ?? NaN, 0);
      expect(read.menu?.y, detail).toBeCloseTo(unpressed.menu?.y ?? NaN, 0);
      expect(read.menu?.width, detail).toBeCloseTo(
        unpressed.menu?.width ?? NaN,
        0,
      );
      expect(read.menu?.height, detail).toBeCloseTo(
        unpressed.menu?.height ?? NaN,
        0,
      );
    }
  });
}

test('the trigger’s visual lays out its children as the trigger would: a block, a row, a grid and a set-height trigger each match a plain box with the same style', async ({
  page,
}) => {
  await openStory(page, storybook(), 'core-contextmenu--touch-trigger-layouts');
  for (const layout of ['block', 'row', 'grid', 'tall']) {
    const read = async (testId: string) =>
      page.getByTestId(testId).evaluate(root => {
        const origin = root.getBoundingClientRect();
        const leaves = [...root.querySelectorAll('*')].filter(
          el =>
            el.childElementCount === 0 &&
            el.getAttribute('aria-hidden') == null,
        );
        return {
          size: {width: origin.width, height: origin.height},
          children: leaves.map(el => {
            const box = el.getBoundingClientRect();
            return {
              x: box.x - origin.x,
              y: box.y - origin.y,
              width: box.width,
              height: box.height,
            };
          }),
        };
      });
    const trigger = await read(`layout-${layout}`);
    const reference = await read(`layout-${layout}-reference`);
    const detail = JSON.stringify({layout, trigger, reference});
    expect(trigger.children.length, detail).toBe(layout === 'tall' ? 1 : 3);
    expect(trigger.children.length, detail).toBe(reference.children.length);
    expect(trigger.size.width, detail).toBeCloseTo(reference.size.width, 1);
    expect(trigger.size.height, detail).toBeCloseTo(reference.size.height, 1);
    for (const [i, child] of trigger.children.entries()) {
      const twin = reference.children[i];
      for (const key of ['x', 'y', 'width', 'height'] as const) {
        expect(child[key], detail).toBeCloseTo(twin[key], 1);
      }
    }
  }
});

test('the menu’s anchor sits under the finger, on screen and as laid out, while the trigger is grown, and the menu stays put', async ({
  page,
}) => {
  const {driver, trigger} = await openTouchStory(page);
  const box = await trigger.boundingBox();
  if (box == null) {
    throw new Error('no trigger');
  }
  const menu = page.getByRole('menu', {name: 'Photo actions'});
  // The cursor anchor (the trigger's last child), on screen and as laid out
  // (engines differ on which one anchor positioning reads).
  const read = async () =>
    trigger.evaluate(el => {
      const anchor = el.lastElementChild as HTMLElement | null;
      const box = el.getBoundingClientRect();
      const host = el as HTMLElement;
      const left = box.left + (box.width - host.offsetWidth) / 2;
      const top = box.top + (box.height - host.offsetHeight) / 2;
      const onScreen = anchor?.getBoundingClientRect();
      return {
        onScreen: onScreen == null ? null : {x: onScreen.x, y: onScreen.y},
        laidOut:
          anchor == null
            ? null
            : {
                x: left + host.clientLeft + anchor.offsetLeft,
                y: top + host.clientTop + anchor.offsetTop,
              },
      };
    });
  // The middle of the card and near its far corner, where an anchor placed
  // in the grown trigger's scaled coordinates would land furthest off.
  for (const [fx, fy] of [
    [0.5, 0.5],
    [0.9, 0.85],
  ] as const) {
    const p = {
      x: Math.round(box.x + box.width * fx),
      y: Math.round(box.y + box.height * fy),
    };
    await driver.play(hold(p, menuDisplayMs + 100));
    await expect(menu).toBeVisible();
    // The entrance plays as a transform on the menu's layer, and a slow first
    // frame (a cold shader cache) can hold it at its start: read once it ends.
    await untilMenuSettled(page);
    const first = await read();
    const firstMenu = await menuBox(page);
    // Later, once the trigger's growth holds at its full size.
    await expect
      .poll(async () => presentedScale(trigger))
      .toBeCloseTo(heldScale, 3);
    const later = await read();
    const laterMenu = await menuBox(page);
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    // The trigger returns to its size before the next press.
    await expect
      .poll(async () => presentedScale(trigger), {timeout: 3000})
      .toBe(1);
    const detail = JSON.stringify({p, first, firstMenu, later, laterMenu});
    expect(first.onScreen?.x, detail).toBeCloseTo(p.x, 0);
    expect(first.onScreen?.y, detail).toBeCloseTo(p.y, 0);
    expect(first.laidOut?.x, detail).toBeCloseTo(p.x, 0);
    expect(first.laidOut?.y, detail).toBeCloseTo(p.y, 0);
    expect(laterMenu?.x, detail).toBeCloseTo(firstMenu?.x ?? NaN, 0);
    expect(laterMenu?.y, detail).toBeCloseTo(firstMenu?.y ?? NaN, 0);
  }
});

test('the stays-put check sees a menu that a transform moves after its show', async ({
  page,
}) => {
  const {driver, trigger} = await openTouchStory(page);
  const box = await trigger.boundingBox();
  if (box == null) {
    throw new Error('no trigger');
  }
  await driver.play(
    hold(
      {
        x: Math.round(box.x + box.width / 2),
        y: Math.round(box.y + box.height / 2),
      },
      menuDisplayMs + 100,
    ),
  );
  await expect(page.getByRole('menu', {name: 'Photo actions'})).toBeVisible();
  await untilMenuSettled(page);
  const before = await menuBox(page);
  await page.evaluate(() => {
    const layer = document
      .querySelector('[role="menu"]')
      ?.closest<HTMLElement>('[popover]');
    if (layer != null) {
      layer.style.translate = '0 8px';
    }
  });
  const after = await menuBox(page);
  expect((after?.y ?? NaN) - (before?.y ?? NaN)).toBeCloseTo(8, 0);
});

test('a drag past the tolerance after the commit opens nothing', async ({
  page,
}) => {
  const {driver, center} = await openTouchStory(page);
  await driver.play(
    drag(
      center,
      {x: center.x, y: center.y + 30},
      {durationMs: 50, holdMs: 500, restMs: 400},
    ),
  );
  await untilMenuMomentPassed(page);
  expect(await menuShownAt(page)).toBeNull();
});

test('an early lift opens nothing, and the card springs back to its size', async ({
  page,
}) => {
  const {driver, trigger, center} = await openTouchStory(page);
  await driver.play(hold(center, 280));
  await untilMenuMomentPassed(page);
  expect(await menuShownAt(page)).toBeNull();
  // The return spring settles within ~1.2 s; then the scale is gone.
  await expect
    .poll(
      async () =>
        visualOf(trigger).evaluate(el => (el as HTMLElement).style.scale),
      {
        timeout: 3000,
      },
    )
    .toBe('');
  expect(await presentedScale(trigger)).toBe(1);
});

test('a second finger landing before the commit cancels: no menu, and the card springs back', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'two-finger input is Chromium-only in Playwright (WebKit drops the first finger)',
  );
  const {driver, trigger, center} = await openTouchStory(page);
  // The first finger holds; a second lands 200 ms in, before the commit.
  await driver.play(
    merge(
      hold(center, menuDisplayMs + 300),
      withFinger(hold({x: center.x + 50, y: center.y}, 400), 1, 200),
    ),
  );
  await untilMenuMomentPassed(page);
  expect(await menuShownAt(page)).toBeNull();
  await expect
    .poll(async () => presentedScale(trigger), {timeout: 3000})
    .toBeCloseTo(1, 3);
  await expect(page.getByRole('menu', {name: 'Photo actions'})).toBeHidden();
});

test('a drift within the tolerance still opens the menu; past it on one axis cancels', async ({
  page,
}) => {
  const {driver, center} = await openTouchStory(page);
  // (8, 8): 11.3 px away, within the tolerance on each axis (a long press's
  // 10 px distance would cancel it). A drift past the browser's own pan slop
  // goes to the page instead, as a scroll view's pan takes it on iOS. Lifted
  // after the commit: the menu opens at the lift.
  await driver.play(
    drag(
      center,
      {x: center.x + 8, y: center.y + 8},
      {durationMs: 60, holdMs: 100, restMs: commitMs},
    ),
  );
  await expect(page.getByRole('menu', {name: 'Photo actions'})).toBeVisible();

  const other = await openTouchStory(page);
  await other.driver.play(
    drag(
      other.center,
      {x: other.center.x, y: other.center.y + 12},
      {durationMs: 60, holdMs: 100, restMs: commitMs},
    ),
  );
  await untilMenuMomentPassed(page);
  expect(await menuShownAt(page)).toBeNull();
});

test('a touch that reaches the page late grows from the first frame at its onset, from rest', async ({
  page,
}) => {
  const {driver, center} = await openTouchStory(page);
  test.skip(
    !driver.scriptedTimestamps,
    'only a Chromium touch takes its timestamp from the script',
  );
  const played = playedCurve();
  await page.evaluate(() => {
    const trigger = document.querySelector<HTMLElement>(
      '[data-testid="touch-context-menu"]',
    );
    const record = {
      touchedAt: 0,
      handledAt: 0,
      frames: [] as {t: number; scale: number}[],
    };
    (window as unknown as {__lateTouch: typeof record}).__lateTouch = record;
    const sample = (t: number) => {
      const scale = getComputedStyle(
        trigger?.firstElementChild as HTMLElement,
      ).scale;
      record.frames.push({
        t,
        scale: scale === 'none' ? 1 : Number.parseFloat(scale),
      });
      if (t - record.touchedAt < 320) {
        requestAnimationFrame(sample);
      }
    };
    addEventListener(
      'touchstart',
      event => {
        record.touchedAt = event.timeStamp;
        record.handledAt = performance.now();
        // Added during the dispatch, it runs after the page's own touchstart
        // listeners. So each frame, the sampler reads after the page's work.
        addEventListener('touchstart', () => requestAnimationFrame(sample), {
          once: true,
          passive: true,
        });
      },
      {capture: true, once: true, passive: true},
    );
  });
  const cdp = await page.context().newCDPSession(page);
  // The touch reaches the page 90 ms after its own timestamp, as through a
  // slow input path. Chromium then holds the page's timers until about
  // 100 ms after it handles the touch.
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{...center, id: 1, radiusX: 1, radiusY: 1, force: 1}],
    timestamp: (Date.now() - 90) / 1000,
  });
  // Held 250 ms on the page clock from the moment the page handled it.
  await page.waitForFunction(() => {
    const record = (window as unknown as {__lateTouch: {handledAt: number}})
      .__lateTouch;
    return record.handledAt > 0 && performance.now() >= record.handledAt + 250;
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
    timestamp: Date.now() / 1000,
  });
  const {touchedAt, handledAt, frames} = await page.evaluate(
    () =>
      (
        window as unknown as {
          __lateTouch: {
            touchedAt: number;
            handledAt: number;
            frames: {t: number; scale: number}[];
          };
        }
      ).__lateTouch,
  );
  expect(handledAt - touchedAt).toBeGreaterThanOrEqual(80);
  const grown = frames.findIndex(frame => frame.scale > 1);
  expect(grown, 'the trigger never grew').toBeGreaterThan(0);
  const before = frames[grown - 1];
  const first = frames[grown];
  const frameMs = first.t - before.t;
  // From rest: the frame before is at rest, and the first grown frame is no
  // further along than the spring one frame in.
  expect(before.scale).toBe(1);
  expect(first.scale).toBeLessThanOrEqual(played.at(frameMs / 1000) + 0.0005);
  // On time: the curve starts in the first frame at or after the onset. So
  // its first grown frame comes within two frames of the onset.
  expect(before.t - touchedAt).toBeGreaterThanOrEqual(feedbackOnsetMs);
  expect(first.t - touchedAt).toBeLessThanOrEqual(
    feedbackOnsetMs + 2 * frameMs + 1,
  );
});

test('the press feedback plays its computed curve on the compositor, frame by frame', async ({
  page,
}, testInfo) => {
  const {driver, trigger, center} = await openTouchStory(page);
  const played = playedCurve();
  const playing = driver.play(hold(center, commitMs + 300));
  await waitForAnimation(visualOf(trigger), {minProgressMs: 16});
  await holdAnimations(page, visualOf(trigger), {
    judges: {target: visualOf(trigger), property: 'scale'},
  });
  // Seek the held curve (its time 0 is the onset after the touch) to every
  // 60 Hz frame and read the presented scale.
  const samples = await visualOf(trigger).evaluate((element, times) => {
    const held =
      (window as unknown as {__harnessHeld?: Animation[]}).__harnessHeld ?? [];
    return times.map(t => {
      for (const animation of held) {
        animation.currentTime = t;
      }
      const scale = getComputedStyle(element).scale;
      return {t, value: scale === 'none' ? 1 : Number.parseFloat(scale)};
    });
  }, timeline(560));
  await releaseAnimations(page);
  await playing;
  const at = (ms: number) => {
    const t = ms - feedbackOnsetMs;
    if (t <= 0) {
      return 1;
    }
    // Linear between the seeked frames.
    const i = samples.findIndex(s => s.t >= t);
    if (i <= 0) {
      return samples[Math.max(0, i)].value;
    }
    const a = samples[i - 1];
    const b = samples[i];
    return a.value + ((b.value - a.value) * (t - a.t)) / (b.t - a.t);
  };
  // The card is 200 px wide, so a scale error times 200 is in pixels.
  const errors = Array.from({length: 33}, (_, i) => feedbackOnsetMs + i * 17)
    .filter(ms => ms <= commitMs + 300)
    .map(ms => {
      const expected = played.at((ms - feedbackOnsetMs) / 1000);
      return {
        ms,
        expected,
        web: at(ms),
        errorPx: Math.abs(at(ms) - expected) * 200,
      };
    });
  const rms = Math.sqrt(
    errors.reduce((sum, e) => sum + e.errorPx ** 2, 0) / errors.length,
  );
  await writeEvidence(
    'curves/contextmenu-press-feedback',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {rmsPt: rms, errors, samples},
        null,
        1,
      ),
    },
    testInfo,
  );
  testInfo.annotations.push({
    type: 'curve-parity',
    description: `press feedback vs its computed curve (200 px card): rms ${rms.toFixed(3)} px over ${errors.length} frames`,
  });
  expect(rms).toBeLessThan(0.1);
  expect(Math.max(...errors.map(e => e.errorPx))).toBeLessThan(0.25);
});

test('the press feedback keeps advancing every frame while the main thread is blocked', async ({
  page,
  browserName,
}, testInfo) => {
  test.skip(
    browserName === 'webkit',
    "WebKit's Linux build runs the trigger's scale, as a transform too, on the main thread: beside a compositor control, its frames hold the trigger's width through the block (README: engine limits). The iOS simulator recording is the WebKit proof.",
  );
  const {driver, trigger, center} = await openTouchStory(page);
  // A wider card grows by about a CSS pixel a frame, which the screencast
  // resolves; it stays inside the viewport at its largest.
  await trigger.evaluate(el => {
    const host = el as HTMLElement;
    (host.firstElementChild?.firstElementChild as HTMLElement).style.width =
      '340px';
  });
  const played = playedCurve();
  await markElement(visualOf(trigger), {mode: 'outline'});
  const cast = await startScreencast(page);
  const playing = driver.play(hold(center, 1100));
  // The lift spring moves the card for about 200 ms, so the block covers
  // its moving part.
  const [feedback] = await waitForAnimation(visualOf(trigger), {
    minProgressMs: 16,
  });
  const block = await blockMainThread(page, 150);
  await playing;
  // Six frames more, so the screencast holds the end of the growth.
  await page.evaluate(
    async () =>
      new Promise<void>(resolve => {
        let frames = 0;
        const step = () => {
          frames += 1;
          if (frames >= 6) {
            resolve();
          } else {
            requestAnimationFrame(step);
          }
        };
        requestAnimationFrame(step);
      }),
  );
  const castFrames = await cast.stop();
  const tracked = await trackMarker(page, castFrames);
  const proof = busyWindowProof(tracked, block, {axis: 'width'});
  // What the curve grows by between the first and the last frame of the
  // judged window, in the marker's pixels, against what those frames show.
  const scaleAt = (epoch: number) => played.at((epoch - feedback.from) / 1000);
  const judged = tracked.filter(
    f => f.box != null && f.t >= block.from + 20 && f.t <= block.to - 20,
  );
  const firstFrame = judged[0];
  const lastFrame = judged.at(-1);
  if (firstFrame?.box == null || lastFrame?.box == null) {
    throw new Error('the screencast shows no marker during the block');
  }
  const restWidth = firstFrame.box.width / scaleAt(firstFrame.t);
  const expectedGrowth =
    restWidth * (scaleAt(lastFrame.t) - scaleAt(firstFrame.t));
  const shownGrowth = lastFrame.box.width - firstFrame.box.width;
  // Widths arrive from the screencast in steps (2 px in Chromium here). One
  // step is the instrument's resolution, and the only allowance below.
  const widthStep = Math.min(
    ...judged.slice(1).flatMap((f, i) => {
      const change = Math.abs(
        (f.box?.width ?? 0) - (judged[i].box?.width ?? 0),
      );
      return change > 0 ? [change] : [];
    }),
  );
  await writeEvidence(
    'busy-main-thread/contextmenu-press-feedback',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {
          block,
          feedback,
          proof,
          frames: tracked.map(f => ({
            t: +(f.t - block.from).toFixed(1),
            w: f.box?.width ?? null,
          })),
        },
        null,
        1,
      ),
    },
    testInfo,
  );
  const film = await castStoryboard(page, castFrames, {
    name: 'contextmenu-press-feedback-busy-main-thread',
    zero: block.from,
    from: block.from - 40,
    to: block.to + 40,
    columns: 8,
    cellScale: 0.35,
    data: t => ({w: tracked.find(f => f.t === t)?.box?.width ?? -1}),
  });
  await film.write(testInfo, {block, feedback, expectedGrowth});
  // Frames kept coming at display rate and the card kept growing, as much
  // as the curve says, within the screencast's resolution.
  expect(proof.medianFrameMs).toBeLessThan(20);
  expect(proof.frames).toBeGreaterThanOrEqual(proof.expectedFrames - 2);
  expect(proof.monotonic).toBe(true);
  expect(proof.longestStallMs).toBeLessThan(4 * (1000 / 60) + 4);
  expect(Number.isFinite(widthStep)).toBe(true);
  expect(shownGrowth).toBeGreaterThanOrEqual(expectedGrowth - widthStep);
});

test('the press feedback does no Layout or Paint per frame', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'rendering traces are Chromium-only');
  const {driver, center} = await openTouchStory(page);
  const timeOrigin = await page.evaluate(() => performance.timeOrigin);
  const trace = await traceRendering(page, async () => {
    // Lifted just before the commit: the feedback alone, then its return.
    await driver.play(hold(center, commitMs - 20));
  });
  const start = timeOrigin + (await touchStartedAt(page));
  const during = countBetween(
    trace,
    start + feedbackOnsetMs + 50,
    start + commitMs - 30,
  );
  expect(during.Layout ?? 0, JSON.stringify(during)).toBe(0);
  expect(during.Paint ?? 0, JSON.stringify(during)).toBe(0);
  expect(trace.longTasks).toEqual([]);
});

/** The story with somewhere to scroll below it, and its trigger's center. */
async function openScrollableStory(page: Page) {
  const story = await openTouchStory(page);
  await page.evaluate(() => {
    document.body.style.paddingBottom = '3000px';
  });
  const box = await story.trigger.boundingBox();
  if (box == null) {
    throw new Error('no trigger');
  }
  const center = {x: box.x + box.width / 2, y: box.y + box.height / 2};
  // Where the trigger's container sits: the trigger itself is scaled by the
  // press feedback.
  const top = async () =>
    story.trigger.evaluate(
      el => (el.parentElement ?? el).getBoundingClientRect().y,
    );
  return {...story, center, top};
}

test('the page does not scroll under the finger that held the menu open, and it does not lock the page', async ({
  page,
}) => {
  const {driver, center, top} = await openScrollableStory(page);
  const before = await top();
  // Held until the menu shows, then dragged up 200 px.
  await driver.play(
    drag(
      center,
      {x: center.x, y: center.y - 200},
      {durationMs: 300, holdMs: menuDisplayMs + 50, restMs: 100},
    ),
  );
  expect(await top()).toBe(before);
  await expect(page.getByRole('menu', {name: 'Photo actions'})).toBeVisible();
  expect(await page.evaluate(() => document.body.style.position)).toBe('');
});

/** WebKit makes a click only from its own tap gesture (harness README). */
const CLICK_FROM_SCRIPT_SKIP =
  'WebKit makes a click from its own tap gesture only, not from a scripted touch';

/** Counts the clicks that reach the trigger from now on. */
async function countTriggerClicks(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as {__triggerClicks?: number};
    w.__triggerClicks = 0;
    const trigger = document.querySelector(
      '[data-testid="touch-context-menu"]',
    );
    document.addEventListener(
      'click',
      event => {
        if (
          trigger != null &&
          event.target instanceof Node &&
          trigger.contains(event.target)
        ) {
          w.__triggerClicks = (w.__triggerClicks ?? 0) + 1;
        }
      },
      true,
    );
  });
  return async () =>
    page.evaluate(
      () =>
        (window as unknown as {__triggerClicks?: number}).__triggerClicks ?? 0,
    );
}

test('a finger that lifts before 400 ms makes a plain tap: one click and no menu', async ({
  page,
}) => {
  const {driver, center} = await openTouchStory(page);
  test.skip(!driver.drivesNativeGestures, CLICK_FROM_SCRIPT_SKIP);
  const clicks = await countTriggerClicks(page);
  // Past core's press onset at 150 ms: a long press that fails is still a
  // tap.
  await driver.play(hold(center, 250));
  const startedAt = await touchStartedAt(page);
  const liftedAfterMs = (await lastInput(page, 'touchend')) - startedAt;
  // The commit at 400 ms runs on the page clock. A lift that reached the page
  // later makes a real long press, so the case cannot judge a tap.
  if (liftedAfterMs >= contextMenu.press.commitMs) {
    throw new Error(
      `the lift reached the page ${liftedAfterMs.toFixed(1)} ms after the touch, past the ${contextMenu.press.commitMs} ms a tap allows`,
    );
  }
  await expect.poll(clicks).toBe(1);
  // The menu's moment passes with no menu.
  await page.waitForFunction(
    dueAt => performance.now() > dueAt,
    startedAt + menuDisplayMs + 100,
  );
  // One task more, so a timer that is due runs before the read.
  await page.evaluate(
    async () =>
      new Promise<void>(resolve => {
        setTimeout(resolve, 0);
      }),
  );
  expect(await menuShownAt(page)).toBeNull();
  await expect(page.getByRole('menu', {name: 'Photo actions'})).toBeHidden();
  expect(await clicks()).toBe(1);
});

/** Two frames on the page: a click the lift makes has reached it by then. */
const afterTwoFrames = async (page: Page) =>
  page.evaluate(
    async () =>
      new Promise<void>(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

test('a slow drift past 11.5 px late in the hold cancels it: no menu and no click (AST-094 FR21)', async ({
  page,
}) => {
  const {driver, center} = await openTouchStory(page);
  const clicks = await countTriggerClicks(page);
  // The finger rests past the commit at 400 ms, then drifts 14 px in 250 ms.
  // It crosses 11.5 px at about 655 ms, before the menu's moment, and it
  // lifts well after that moment.
  await driver.play(
    drag(
      center,
      {x: center.x + 14, y: center.y},
      {holdMs: 450, durationMs: 250, restMs: 400},
    ),
  );
  await touchStartedAt(page);
  await afterTwoFrames(page);
  expect(await menuShownAt(page)).toBeNull();
  await expect(page.getByRole('menu', {name: 'Photo actions'})).toBeHidden();
  // Only Chromium makes a click from a scripted touch, so only it can show
  // that none came.
  if (driver.drivesNativeGestures) {
    expect(await clicks()).toBe(0);
  }
});

test('a drift from before 735 ms that reaches the page behind a block still cancels the hold: no menu (AST-094 FR16)', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'touches stamped and sent while the page is blocked need Chromium’s protocol',
  );
  // Each move's own time, and when the page got it.
  await page.addInitScript(() => {
    const w = window as unknown as {__moves: [number, number][]};
    w.__moves = [];
    window.addEventListener(
      'pointermove',
      event => {
        w.__moves.push([event.timeStamp, performance.now()]);
      },
      {capture: true, passive: true},
    );
  });
  const {center} = await openTouchStory(page);
  const cdp = await page.context().newCDPSession(page);
  const start = Date.now();
  const at = async (ms: number) =>
    new Promise(resolve => {
      setTimeout(resolve, Math.max(0, start + ms - Date.now()));
    });
  const touch = async (
    type: 'touchStart' | 'touchMove' | 'touchEnd',
    ms: number,
    dx: number | null,
  ) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: dx == null ? [] : [{x: center.x + dx, y: center.y}],
      timestamp: (start + ms) / 1000,
    });
  await touch('touchStart', 0, 0);
  // The page is blocked from 600 ms to 850 ms, past the menu's moment. The
  // finger crosses 11.5 px at 700 ms, so the page gets that move after the
  // block.
  await at(600);
  const blocking = blockMainThread(page, 250);
  await at(650);
  const moves = [touch('touchMove', 650, 6)];
  await at(700);
  moves.push(touch('touchMove', 700, 14));
  const blocked = await blocking;
  await Promise.all(moves);
  await at(1150);
  await touch('touchEnd', 1150, null);
  await afterTwoFrames(page);
  const moment = (await touchStartedAt(page)) + menuDisplayMs;
  const origin = await page.evaluate(() => performance.timeOrigin);
  const blockEnd = blocked.to - origin;
  expect(
    blocked.from - origin,
    'the block starts before the menu’s moment',
  ).toBeLessThan(moment);
  expect(blockEnd, 'the block ends after the menu’s moment').toBeGreaterThan(
    moment,
  );
  const early = (
    await page.evaluate(
      () => (window as unknown as {__moves: [number, number][]}).__moves,
    )
  ).filter(([time]) => time < moment);
  expect(
    early.length,
    'a move from before the menu’s moment reached the page',
  ).toBeGreaterThan(0);
  for (const [, receivedAt] of early) {
    expect(
      receivedAt,
      'the move reached the page after the block',
    ).toBeGreaterThanOrEqual(blockEnd);
    // The press waits 50 ms for moves still queued.
    expect(
      receivedAt - blockEnd,
      'the move reached the page within the press’s wait',
    ).toBeLessThan(50);
  }
  expect(
    await menuShownAt(page),
    'the menu showed for a drift from before its moment',
  ).toBeNull();
  await expect(page.getByRole('menu', {name: 'Photo actions'})).toBeHidden();
});

test('a finger still inside 11.5 px at the menu’s moment that crosses it just after still gets the menu (AST-094 FR12)', async ({
  page,
}) => {
  const {driver, center} = await openTouchStory(page);
  // 14 px over 650–760 ms: 10.6 px at the last move before 735 ms, 12.7 px
  // at the first move after it.
  await driver.play(
    drag(
      center,
      {x: center.x + 14, y: center.y},
      {holdMs: 650, durationMs: 110, restMs: 300},
    ),
  );
  await expect(page.getByRole('menu', {name: 'Photo actions'})).toBeVisible();
});

test('a new finger that pans outside the open menu closes it, and the page scrolls', async ({
  page,
}) => {
  const {driver, center, top} = await openScrollableStory(page);
  await driver.play(hold(center, menuDisplayMs + 50));
  const menu = page.getByRole('menu', {name: 'Photo actions'});
  await expect(menu).toBeVisible();
  const before = await top();
  // The menu opens at the finger. So the new finger lands beside the menu's
  // box, at the first point below or above it with room for the pan.
  const box = await menu.boundingBox();
  const viewport = page.viewportSize();
  if (box == null || viewport == null) {
    throw new Error('the menu or the viewport has no box');
  }
  const outside = [
    {x: center.x, y: Math.round(box.y + box.height + 40)},
    {x: center.x, y: Math.round(box.y - 40)},
  ].find(point => point.y - 130 > 0 && point.y + 10 < viewport.height);
  if (outside == null) {
    throw new Error('no point beside the menu has room for the pan');
  }
  expect(
    await page.evaluate(
      ({x, y}) => document.elementFromPoint(x, y)?.closest('[role="menu"]'),
      outside,
    ),
  ).toBeNull();
  await driver.play(
    drag(outside, {x: outside.x, y: outside.y - 120}, {durationMs: 300}),
  );
  await expect(page.getByRole('menu', {name: 'Photo actions'})).toBeHidden();
  // WebKit scrolls nothing from an injected touch (README: engine limits).
  if (driver.drivesNativeGestures) {
    expect(await top()).toBeLessThan(before);
  }
});

test('a drag that cancels the press after the commit does not scroll the page either', async ({
  page,
}) => {
  const {driver, center, top} = await openScrollableStory(page);
  const before = await top();
  await driver.play(
    drag(
      center,
      {x: center.x, y: center.y - 200},
      {durationMs: 300, holdMs: commitMs + 100, restMs: 100},
    ),
  );
  expect(await menuShownAt(page)).toBeNull();
  expect(await top()).toBe(before);
});

test(
  'storyboard: the press feedback up to the menu',
  {tag: '@storyboard'},
  async ({page}, testInfo) => {
    const {driver, trigger, center} = await openTouchStory(page);
    const box = await trigger.boundingBox();
    if (box == null) {
      throw new Error('no trigger');
    }
    // Gate the page's timers first: the commit and the menu wait while the
    // held feedback is photographed, and the finger stays down meanwhile.
    await installTimerGate(page);
    const playing = driver.play(hold(center, 8000));
    await waitForAnimation(visualOf(trigger), {minProgressMs: 16});
    await freezeTimers(page);
    const {storyboard} = await animationStoryboard(page, {
      name: 'contextmenu-press-feedback',
      clip: {
        x: box.x - 24,
        y: box.y - 24,
        width: box.width + 48,
        height: box.height + 48,
      },
      scope: trigger,
      judges: {target: visualOf(trigger), property: 'scale'},
      // t counts from the visible ramp's start, the onset after the touch.
      times: timeline(menuDisplayMs - feedbackOnsetMs, 1000 / 30),
      measure: async () => ({
        scale: (await presentedScale(trigger)).toFixed(4),
      }),
      columns: 6,
      cellScale: 0.6,
    });
    await releaseAnimations(page);
    await thawTimers(page);
    await playing;
    await storyboard.write(testInfo);
    const scales = storyboard.frames.map(f => Number(f.data.scale));
    // The lift spring rises to its peak, overshoots by under 3% of its
    // travel, and settles at the held scale before the menu displays.
    const peak = scales.indexOf(Math.max(...scales));
    expect(
      scales.slice(0, peak + 1).every((s, i, a) => i === 0 || s >= a[i - 1]),
    ).toBe(true);
    expect(scales[peak]).toBeLessThan(heldScale + (heldScale - 1) * 0.03);
    expect(scales.at(-1)).toBeCloseTo(heldScale, 2);
  },
);
