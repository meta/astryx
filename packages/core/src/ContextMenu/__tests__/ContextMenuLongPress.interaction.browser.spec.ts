// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ContextMenuLongPress.interaction.browser.spec.ts
 * @input The built "Touch / long press" ContextMenu story, real touch input,
 *   the interaction harness, the context-menu constants and UIKit's frames
 * @output Interaction and animation proofs for a context menu that a held
 *   finger opens on UIKit's timeline. They cover the menu's moments, on
 *   time and behind a blocked main thread. They also cover the page under
 *   the finger, a pan outside and a storyboard of the press
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
  drag,
  FRAME_STARVATION_MS,
  FrameStarvationError,
  installInputLog,
  openStory,
  readInputLog,
  tap,
  touchDriver,
  withStorybook,
  type TouchDriver,
} from '@astryxdesign/interaction-harness';
import {contextMenu} from '../../motion/uikit/contextMenu';

const storybook = withStorybook(test);
const {menuDisplayMs} = contextMenu.press;
// Core's press machine believes a press 150 ms after it lands
// (`utils/pressGesture.ts`). That module loads a StyleX stylesheet, which
// this Node-side spec cannot, so the onset is restated here.

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
  // Note when the menu is asked to show, on the page clock (no per-frame
  // work: rendering proofs share this page).
  await page.addInitScript(() => {
    const w = window as unknown as {
      __menuShownAt?: number | null;
      __menuShownTimerAt?: number | null;
    };
    w.__menuShownAt = null;
    w.__menuShownTimerAt = null;
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

test('a finger that shifts slightly just before 735 ms gets the menu at 735 ms when its move reaches the page on time (AST-094 FR12)', async ({
  page,
}) => {
  const {driver, center} = await openTouchStory(page);
  await startFrameLog(page);
  // One 3 px move at 700 ms, then still. An idle page gets the move at once.
  await driver.play(
    drag(
      center,
      {x: center.x + 3, y: center.y},
      {holdMs: 699, durationMs: 1, restMs: 300},
    ),
  );
  const frames = await readFrameLog(page);
  const start = await touchStartedAt(page);
  const shown = await menuShownAt(page);
  const decided = await menuShownTimerAt(page);
  expect(shown, 'the menu never showed').not.toBeNull();
  // The moment's own timer task shows the menu: nothing waits.
  expect(
    decided,
    'the menu showed after the task that decided it',
  ).not.toBeNull();
  expectDecidedOnTime(frames, start + menuDisplayMs, decided as number);
  const after = (shown as number) - start;
  expect(after).toBeGreaterThanOrEqual(menuDisplayMs);
  expect(after).toBeLessThan(menuDisplayMs + 20);
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
  const top = async () =>
    story.trigger.evaluate(
      el => (el.parentElement ?? el).getBoundingClientRect().y,
    );
  return {...story, center, top};
}

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
