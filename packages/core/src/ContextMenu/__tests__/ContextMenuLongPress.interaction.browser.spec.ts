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
  // Where the trigger's container sits: the trigger itself is scaled by the
  // press feedback.
  const top = async () =>
    story.trigger.evaluate(
      el => (el.parentElement ?? el).getBoundingClientRect().y,
    );
  return {...story, center, top};
}

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
