// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file BottomSheetDetent.interaction.browser.spec.ts
 * @input The built "Snap points" BottomSheet story, real touch input
 *   (Chromium CDP / WebKit's input command), the interaction harness and the
 *   UIKit constants table (the parameters the oracle springs use)
 * @output Interaction and animation proofs for releasing the sheet: the drag
 *   follows the finger and a slow release settles on the nearest detent; a
 *   flick dismisses; the settle is UIKit's release spring, sampled frame by
 *   frame against an independent spring oracle, starting at the finger's
 *   velocity (critically damped below `sheet.release.fastSpeed`, 80 % damped
 *   above); a finger catches the settling sheet where it is; the settle keeps
 *   advancing every frame through a blocked main thread; it does no Layout or
 *   Paint per frame; a finger's drag on Android re-rasters none of the sheet
 *   (pending a fix at its origin); storyboards of the drag, the settle and a flick. A finger
 *   on Android gets the same (one touch model, AST-094); a mouse keeps today's
 *   rule and the theme's timing (unit tests). Under reduced motion a touch release cross-fades in place
 *   in 200 ms or less (design:reduced-motion DR2).
 * @position The exemplar for `*.interaction.browser.spec.ts`: component lanes
 *   copy this shape. Each test names the instrument it uses from
 *   @astryxdesign/interaction-harness, so the evidence layer is explicit.
 *
 * The sheet moves on the `translate` property while a gesture or its release
 * runs (the motion foundation's animator; its resting position is the
 * element's `transform`), so curves are sampled from both (`sampleTravel`).
 *
 * UIKit's release belongs to every finger (one touch model), so most cases
 * run under `emulateIosWebKit` and the Android cases without it, to show the
 * same behavior without WebKit on iOS.
 */

import {expect, test, type Locator, type Page} from '@playwright/test';
import {
  animationStoryboard,
  blockMainThread,
  busyWindowProof,
  castStoryboard,
  compareCurve,
  countBetween,
  drag,
  flick,
  frames,
  freezeTimers,
  holdAnimations,
  installInputLog,
  installLongTaskLog,
  installTimerGate,
  markElement,
  openStory,
  readInputLog,
  readLongTasks,
  releaseAnimations,
  releaseVelocity,
  retakeOnTouchPacing,
  springStep,
  startScreencast,
  thawTimers,
  timeline,
  touchDriver,
  toTouchEvents,
  touchStoryboard,
  traceRendering,
  trackMarker,
  withStorybook,
  waitForAnimation,
  waitForRest,
  writeEvidence,
  type InputRecord,
  type PlayedEvent,
  type TimedValue,
  type TouchDriver,
} from '@astryxdesign/interaction-harness';
import {END_HOLD_MS} from './specConstants';
import {PROMOTION_LINGER_MS} from '../../motion/animator';
import {sheet as sheetTable} from '../../motion/uikit/sheet';
import {springs} from '../../motion/uikit/springs';
import {emulateIosWebKit} from './emulateIosWebKit';

const storybook = withStorybook(test);

interface OpenSheet {
  driver: TouchDriver;
  sheet: Locator;
  /** Top of the sheet at its tall detent and at the half-viewport detent, CSS px. */
  tallTop: number;
  halfTop: number;
  handle: {x: number; y: number};
}

async function openSheet(
  page: Page,
  {idiom = 'ios'}: {idiom?: 'ios' | 'android'} = {},
): Promise<OpenSheet> {
  if (idiom === 'ios') {
    await emulateIosWebKit(page);
  }
  await installLongTaskLog(page);
  await installInputLog(page);
  await openStory(page, storybook(), 'core-bottomsheet--snap-points');
  const driver = await touchDriver(page);
  const trigger = page.getByRole('button', {name: 'Open nearby places'});
  const box = await trigger.boundingBox();
  if (box == null) {
    throw new Error('no trigger');
  }
  await driver.tap({x: box.x + box.width / 2, y: box.y + box.height / 2});
  const sheet = page
    .getByRole('dialog', {name: 'Nearby places'})
    .locator('.astryx-bottom-sheet')
    .first();
  await expect(sheet).toBeVisible();
  await waitForRest(sheet);
  const rect = await sheet.boundingBox();
  if (rect == null) {
    throw new Error('no sheet');
  }
  const viewport = page.viewportSize();
  if (viewport == null) {
    throw new Error('no viewport');
  }
  return {
    driver,
    sheet,
    tallTop: rect.y,
    // snapPoints={[0.5]}: the extra stop shows half the viewport.
    halfTop: viewport.height * 0.5,
    handle: {x: rect.x + rect.width / 2, y: rect.y + 12},
  };
}

/**
 * The page a velocity proof's attempt runs on. A re-take (retakeOnTouchPacing,
 * once, only when WebKit received the gesture off its scripted pacing) starts
 * over on a fresh page, since the first gesture already moved the sheet.
 */
async function pageForAttempt(page: Page, attempt: 1 | 2): Promise<Page> {
  if (attempt === 1) {
    return page;
  }
  const fresh = await page.context().newPage();
  await page.close();
  return fresh;
}

// A plain evaluate, not boundingBox(): it must also work while the page's timers are frozen.
const sheetTop = async (sheet: Locator) =>
  sheet.evaluate(el => el.getBoundingClientRect().y);

const SLOW_DRAG_MS = 400;

/**
 * A slow drag that rests one frame before the lift. A still finger sends no
 * events, and a lift within the release filter's stillness interval (40 ms)
 * keeps the last moving speed, so the release carries `dy / 0.4 s`
 * (`slowDragSpeed`); a longer rest would read 0 (spec:AST-100 FR2).
 */
function slowDragTo(from: {x: number; y: number}, dy: number) {
  return drag(
    from,
    {x: from.x, y: from.y + dy},
    {durationMs: SLOW_DRAG_MS, hz: 60, restMs: 16},
  );
}
const slowDragSpeed = (dy: number) => (dy * 1000) / SLOW_DRAG_MS;

/**
 * A finger that holds 100 ms, drags 80 px down and most of the way back, and
 * lifts still, 16 px below where it started: the sheet settles back on the
 * tallest detent and keeps its size, so nothing about its layout changes.
 */
function outAndBack(from: {x: number; y: number}) {
  return drag(
    from,
    {x: from.x, y: from.y + 80},
    {
      durationMs: SLOW_DRAG_MS,
      hz: 60,
      holdMs: 100,
      restMs: 60,
      easing: p => (p <= 0.5 ? 2 * p : 1 - 1.6 * (p - 0.5)),
    },
  );
}

/**
 * The sheet's vertical translation at each time (ms from the held
 * animations' start): its `translate` (the release spring) plus its
 * `transform` (the resting detent). Hold the animations first.
 */
async function sampleTravel(
  sheet: Locator,
  times: ReadonlyArray<number>,
): Promise<TimedValue[]> {
  return sheet.evaluate((element, ts) => {
    const held =
      (window as unknown as {__harnessHeld?: Animation[]}).__harnessHeld ?? [];
    if (held.length === 0) {
      throw new Error('sampleTravel: no held animations');
    }
    return ts.map(t => {
      for (const animation of held) {
        const end = Number(
          animation.effect?.getComputedTiming().endTime ?? Infinity,
        );
        animation.currentTime = Math.min(t, end - 0.5);
      }
      const style = getComputedStyle(element);
      const translate =
        style.translate === 'none'
          ? 0
          : Number.parseFloat(style.translate.split(' ')[1] ?? '0');
      const transform =
        style.transform === 'none' ? 0 : new DOMMatrix(style.transform).m42;
      return {t, value: translate + transform};
    });
  }, times);
}

/**
 * The velocity UIKit reports at the lift (px/s) for the touch the page
 * received last: 0.2 × the newest event's instantaneous speed + 0.8 × the
 * one before, never decaying through a rest (UIPanGestureRecognizer, measured
 * on the iOS 26.2 simulator). From the events' own timestamps and positions,
 * so it holds in WebKit too, whose input carries real dispatch times and
 * whole-pixel positions rather than the script's.
 */
function uikitReleaseVelocity(records: ReadonlyArray<InputRecord>): number {
  const touch = records.filter(
    r =>
      r.pointerType === 'touch' &&
      (r.type === 'pointerdown' || r.type === 'pointermove') &&
      r.y != null,
  );
  const samples = touch.slice(
    touch.map(r => r.type).lastIndexOf('pointerdown'),
  );
  const speed = (a: InputRecord, b: InputRecord) =>
    b.timeStamp > a.timeStamp
      ? (((b.y as number) - (a.y as number)) / (b.timeStamp - a.timeStamp)) *
        1000
      : 0;
  const n = samples.length;
  if (n < 2) {
    return 0;
  }
  if (n === 2) {
    return speed(samples[0], samples[1]);
  }
  return (
    0.2 * speed(samples[n - 2], samples[n - 1]) +
    0.8 * speed(samples[n - 3], samples[n - 2])
  );
}

/** Chromium's clamp on an event's time as a page reads it, ms. */
const PAGE_CLOCK_CLAMP_MS = 0.1;

/**
 * Checks that the samples UIKit's filter reads (the last three touch samples)
 * are the script's: each at a scripted move's time and position. Chromium's
 * input carries the script's timestamps and sub-pixel positions, but a page
 * reads each event's time clamped to 0.1 ms with a jittered threshold
 * (Chromium's time clamping without cross-origin isolation), so a sample sits
 * up to two clamps off the script's time relative to the touch-down: a
 * scripted 8.33 ms interval reads 8.2 to 8.5 ms, which alone moves the
 * two-sample filter up to 2 % off a steady speed. What the filter reads is
 * what the curve below is checked against, so the speed itself is not
 * compared.
 */
function expectSamplesOnScript(
  records: ReadonlyArray<InputRecord>,
  played: ReadonlyArray<PlayedEvent>,
): void {
  const touch = records.filter(
    r =>
      r.pointerType === 'touch' &&
      (r.type === 'pointerdown' || r.type === 'pointermove') &&
      r.y != null,
  );
  const down = touch.map(r => r.type).lastIndexOf('pointerdown');
  const start = played.find(e => e.type === 'touchStart');
  expect(down).toBeGreaterThanOrEqual(0);
  expect(start).toBeDefined();
  const offset = touch[down].timeStamp - (start as PlayedEvent).t;
  const moves = played.filter(e => e.type === 'touchMove');
  for (const sample of touch.slice(down + 1).slice(-3)) {
    const t = sample.timeStamp - offset;
    const step = moves.find(
      e => Math.abs(e.t - t) <= 2 * PAGE_CLOCK_CLAMP_MS + 1e-6,
    );
    expect(step, `a scripted move at ${t.toFixed(2)} ms`).toBeDefined();
    expect(sample.y as number).toBeCloseTo(
      (step as PlayedEvent).fingers[0].y,
      2,
    );
  }
}

/**
 * UIKit's release spring for a settle from `from` to `to` (px) that starts at
 * `velocity` px/s, from the harness's own spring math (independent of the
 * code under test) and the constants table's parameters.
 */
function uikitRelease(from: number, to: number, velocity: number) {
  const spring =
    Math.abs(velocity) >= sheetTable.release.fastSpeed
      ? springs.sheetReleaseFast
      : springs.sheetDetent;
  const initialVelocity = to === from ? 0 : velocity / (to - from);
  return (t: number) =>
    from +
    (to - from) *
      springStep(
        {
          response: spring.response,
          dampingFraction: spring.dampingRatio,
          initialVelocity,
        },
        t,
      );
}

/** Holds the release's animation and compares it with UIKit's spring. */
async function compareRelease(
  page: Page,
  sheet: Locator,
  velocity: number,
): Promise<{
  result: ReturnType<typeof compareCurve>;
  samples: TimedValue[];
  from: number;
  to: number;
}> {
  const [settle] = await waitForAnimation(sheet);
  await holdAnimations(page, sheet);
  const samples = await sampleTravel(sheet, timeline(settle.durationMs));
  const from = samples[0].value;
  const to = samples[samples.length - 1].value;
  const result = compareCurve(samples, uikitRelease(from, to, velocity), 0.5);
  await releaseAnimations(page);
  return {result, samples, from, to};
}

test('a slow drag follows the finger and settles on the nearest detent', async ({
  page,
  browserName,
}) => {
  const {driver, sheet, tallTop, halfTop, handle} = await openSheet(page);
  // Two thirds of the way to the half detent: nearer to it than to tall.
  const dy = Math.round((halfTop - tallTop) * 0.66);
  const script = slowDragTo(handle, dy);
  const lastMove =
    toTouchEvents(script).filter(e => e.type === 'touchMove').length - 1;
  const tracked: {top: number; finger: number}[] = [];
  let moves = 0;
  let restingTop = NaN;
  const started = Date.now();
  await driver.play(script, {
    onEvent: async step => {
      if (step.type !== 'touchMove') {
        return;
      }
      // A frame after each move, so the page has handled it (Chromium hands
      // touch moves over on the next animation frame), and once more after
      // the last move: the finger rests 150 ms before lifting.
      await frames(page, 1);
      tracked.push({
        top: await sheetTop(sheet),
        finger: step.changed[0].y - handle.y,
      });
      if (moves++ === lastMove) {
        await frames(page, 1);
        restingTop = await sheetTop(sheet);
      }
    },
  });
  // 1:1 with the finger at every move, no pull toward a detent (within the
  // pixel WebKit rounds touch positions to).
  for (const {top, finger} of tracked) {
    expect(Math.abs(top - tallTop - finger)).toBeLessThanOrEqual(1);
  }
  expect(restingTop).toBeCloseTo(tallTop + dy, 0);
  await waitForRest(sheet);
  expect(await sheetTop(sheet)).toBeCloseTo(halfTop, 0);
  // No long task from the gesture or the settle (the story's own load is
  // excluded). Only Chromium has the Long Tasks API, so only Chromium can
  // check this; the drag and the settle above hold in both engines.
  if (browserName === 'chromium') {
    expect(await readLongTasks(page, {from: started, to: Date.now()})).toEqual(
      [],
    );
  }
});

test('pulled up past the tallest detent, the sheet stretches by the rubber band and settles back (spec:AST-094 FR3)', async ({
  page,
}) => {
  const {driver, sheet, tallTop, handle} = await openSheet(page);
  // UIKit's rubber band over the sheet's height (coefficient 0.55), no
  // farther than the 48 px the sheet reserves below the screen.
  const height = await sheet.evaluate(el => el.getBoundingClientRect().height);
  const band = (past: number) =>
    Math.min(48, (1 - 1 / ((past * 0.55) / height + 1)) * height);
  const pulled: {top: number; past: number}[] = [];
  await driver.play(
    drag(handle, {x: handle.x, y: handle.y - 120}, {durationMs: 400, hz: 60}),
    {
      onEvent: async step => {
        if (step.type === 'touchMove') {
          // A frame after each move, so the page has handled it.
          await frames(page, 1);
          pulled.push({
            top: await sheetTop(sheet),
            past: handle.y - step.changed[0].y,
          });
        }
      },
    },
  );
  expect(pulled.length).toBeGreaterThan(0);
  for (const {top, past} of pulled) {
    expect(Math.abs(top - (tallTop - band(past)))).toBeLessThanOrEqual(1);
  }
  // Let go, it settles back onto the tallest detent.
  await waitForRest(sheet);
  expect(await sheetTop(sheet)).toBeCloseTo(tallTop, 0);
});

test('on Android too, the drag tracks the finger 1:1 and stretches past the tallest detent', async ({
  page,
}) => {
  // Tracking is universal (F4's Android audit): no shim, Chromium's own idiom.
  const {driver, sheet, tallTop, halfTop, handle} = await openSheet(page, {
    idiom: 'android',
  });
  const tracked: {top: number; finger: number}[] = [];
  await driver.play(
    slowDragTo(handle, Math.round((halfTop - tallTop) * 0.66)),
    {
      onEvent: async step => {
        if (step.type === 'touchMove') {
          await frames(page, 1);
          tracked.push({
            top: await sheetTop(sheet),
            finger: step.changed[0].y - handle.y,
          });
        }
      },
    },
  );
  expect(tracked.length).toBeGreaterThan(0);
  for (const {top, finger} of tracked) {
    expect(Math.abs(top - tallTop - finger)).toBeLessThanOrEqual(1);
  }
  await waitForRest(sheet);
  const restTop = await sheetTop(sheet);
  const upHandle = {x: handle.x, y: restTop + 12};
  const tops: number[] = [];
  // From half, up past the tallest detent: it follows to tall, then
  // stretches by the rubber band, within the 48 px reserve (spec:AST-094 FR3).
  await driver.play(
    drag(
      upHandle,
      {x: upHandle.x, y: tallTop - 108},
      {durationMs: 500, hz: 60},
    ),
    {
      onEvent: async step => {
        if (step.type === 'touchMove') {
          tops.push(await sheetTop(sheet));
        }
      },
    },
  );
  expect(Math.min(...tops)).toBeGreaterThanOrEqual(tallTop - 48.5);
  expect(Math.min(...tops)).toBeLessThan(tallTop - 10);
});

test('a downward flick lands on the next detent, and from there dismisses', async ({
  page: firstPage,
}, testInfo) => {
  // Its outcome follows the flick's speed, so WebKit's pacing is checked.
  await retakeOnTouchPacing(testInfo, async attempt => {
    const page = await pageForAttempt(firstPage, attempt);
    const {driver, sheet, halfTop, handle} = await openSheet(page);
    // 2000 px/s for 80 ms from the tall detent: a flick, so at least to the
    // next detent down, the half one, which its projection (160 + 2000 × 0.1
    // = 360 px) is nearest too (UIKit sends a medium/large sheet flicked this
    // way from large to medium).
    const fromTall = flick(handle, {
      velocity: {x: 0, y: 2000},
      durationMs: 80,
      hz: 120,
    });
    expect(releaseVelocity(fromTall).y).toBeCloseTo(2000, -1);
    await driver.play(fromTall, {checkPacing: true});
    await waitForRest(sheet);
    expect(await sheetTop(sheet)).toBeCloseTo(halfTop, 0);
    // The same flick from the half detent goes on to the next position: gone.
    await driver.play(
      flick(
        {x: handle.x, y: halfTop + 12},
        {velocity: {x: 0, y: 2000}, durationMs: 80, hz: 120},
      ),
      {checkPacing: true},
    );
    await expect(
      page.getByRole('dialog', {name: 'Nearby places'}),
    ).toBeHidden();
  });
});

test('the settle is the UIKit release spring, sampled frame by frame', async ({
  page,
}, testInfo) => {
  const {driver, sheet, tallTop, halfTop, handle} = await openSheet(page);
  const dy = Math.round((halfTop - tallTop) * 0.66);
  const script = slowDragTo(handle, dy);
  expect(releaseVelocity(script).y).toBeCloseTo(slowDragSpeed(dy), -1);
  await readInputLog(page, {clear: true});
  const played = await driver.play(script);
  // The critically damped detent spring from where the finger left the
  // sheet, handed the drag's speed, which survives the frame's rest before
  // the lift.
  // In Chromium the page measures the script (expectSamplesOnScript).
  // WebKit's input carries real dispatch times in whole milliseconds, so what
  // it measures varies with the box; the curve below is checked against that
  // measurement either way.
  const records = await readInputLog(page);
  const velocity = uikitReleaseVelocity(records);
  if (driver.scriptedTimestamps) {
    expectSamplesOnScript(records, played);
  }
  const {result, samples, to} = await compareRelease(page, sheet, velocity);
  await writeEvidence(
    'curves/bottomsheet-settle',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {spring: springs.sheetDetent, velocity, samples, comparison: result},
        null,
        2,
      ),
    },
    testInfo,
  );
  expect(result.maxError, JSON.stringify(result.worst)).toBeLessThanOrEqual(
    0.5,
  );
  expect(to).toBeCloseTo(halfTop - tallTop, 0);
});

for (const {name, speed, travel} of [
  // Released after a slow pull, below the speed that switches springs: the
  // critically damped spring, handed the finger's velocity.
  {name: 'a moderate throw', speed: 600, travel: 0.4},
  // Above sheet.release.fastSpeed: the 80 % damped spring.
  {name: 'a fast throw', speed: 1500, travel: 0.25},
]) {
  test(`${name} hands its velocity to the release spring`, async ({
    page: firstPage,
  }, testInfo) => {
    // Its outcome follows the throw's speed, so WebKit's pacing is checked.
    await retakeOnTouchPacing(testInfo, async attempt => {
      const page = await pageForAttempt(firstPage, attempt);
      const {driver, sheet, tallTop, halfTop, handle} = await openSheet(page);
      // A pull toward the half detent, then a constant-speed throw at `speed`
      // for the last 100 ms: it projects past halfway, so it lands there.
      const pull = Math.round((halfTop - tallTop) * travel);
      const throwDistance = (speed * 100) / 1000;
      const start = {x: handle.x, y: handle.y};
      const script = drag(
        start,
        {x: start.x, y: start.y + pull + throwDistance},
        {
          durationMs: 100 + (pull / throwDistance) * 100,
          hz: 120,
        },
      );
      expect(releaseVelocity(script).y).toBeCloseTo(speed, -1);
      await readInputLog(page, {clear: true});
      const played = await driver.play(script, {checkPacing: true});
      // What the page measured: the script in Chromium, to within its clock's
      // clamp (expectSamplesOnScript). WebKit's input carries real dispatch
      // times in whole milliseconds and whole pixels: at 120 Hz one
      // millisecond is 12 % of an interval, and UIKit's two-sample filter
      // reads 1333–1625 px/s of a steady 1500 from that rounding alone, more
      // when a dispatch runs late. The curve and the hand-off below are
      // checked against what the page measured, in both engines.
      const records = await readInputLog(page);
      const velocity = uikitReleaseVelocity(records);
      if (driver.scriptedTimestamps) {
        expectSamplesOnScript(records, played);
      }
      const {result, samples, from, to} = await compareRelease(
        page,
        sheet,
        velocity,
      );
      await writeEvidence(
        `curves/bottomsheet-release-${speed}`,
        {
          [`${testInfo.project.name}.json`]: JSON.stringify(
            {speed, velocity, from, to, samples, comparison: result},
            null,
            2,
          ),
        },
        testInfo,
      );
      expect(to).toBeCloseTo(halfTop - tallTop, 0);
      expect(result.maxError, JSON.stringify(result.worst)).toBeLessThanOrEqual(
        0.5,
      );
      // The hand-off is what the curve shows: a spring started at rest would
      // trail it by several px within the first 16 ms.
      const atRest = uikitRelease(from, to, 0);
      const at16 = samples.find(s => s.t >= 16) ?? samples[1];
      expect(Math.abs(at16.value - atRest(at16.t))).toBeGreaterThan(3);
    });
  });
}

test('a finger catches the settling sheet where it is', async ({page}) => {
  const {driver, sheet, tallTop, halfTop, handle} = await openSheet(page);
  const target = halfTop - tallTop;
  // A moderate throw toward the half detent; catch it ~100 ms into the settle.
  const pull = Math.round(target * 0.4);
  await driver.play(
    drag(handle, {x: handle.x, y: handle.y + pull + 60}, {durationMs: 200}),
  );
  await waitForAnimation(sheet, {minProgressMs: 90});
  // How far the settle moves in a frame right now, then where it is.
  const before = await sheetTop(sheet);
  await frames(page, 1);
  const caughtAt = await sheetTop(sheet);
  const perFrame = Math.abs(caughtAt - before);
  expect(caughtAt).toBeGreaterThan(tallTop + pull);
  expect(caughtAt).toBeLessThan(halfTop - 1);
  // Press where the handle is now, hold still for 150 ms, then pull up 40 px.
  const handleNow = {x: handle.x, y: caughtAt + 12};
  let pressed = NaN;
  let held = NaN;
  const tops: number[] = [];
  await driver.play(
    drag(
      handleNow,
      {x: handleNow.x, y: handleNow.y - 40},
      {durationMs: 200, holdMs: 150, hz: 60},
    ),
    {
      onEvent: async (step, index) => {
        if (index === 0) {
          await frames(page, 1);
          pressed = await sheetTop(sheet);
          await page.waitForTimeout(80);
          held = await sheetTop(sheet);
        } else if (step.type === 'touchMove') {
          await frames(page, 1);
          tops.push(await sheetTop(sheet));
        }
      },
    },
  );
  // Caught where it was: no jump at the press beyond the frame or two the
  // settle moved between the read and the press ...
  expect(Math.abs(pressed - caughtAt)).toBeLessThanOrEqual(2 * perFrame + 1);
  // ... and it stays there while the finger holds still,
  expect(Math.abs(held - pressed)).toBeLessThan(0.5);
  // then follows the pull.
  expect(tops[tops.length - 1]).toBeCloseTo(pressed - 40, -1);
});

test('a finger on the drawn sheet catches it even when the hit test lands on the scrim, as WebKit does', async ({
  page,
}) => {
  // iOS Safari 26.2 hit-tests an element a compositor animation is moving at
  // its un-animated position: a touch on the moving sheet arrives on the
  // scrim (or content the sheet has left). Mimicked here by dispatching the
  // touch to the dialog itself, at a point on the drawn sheet.
  const {driver, sheet, tallTop, halfTop, handle} = await openSheet(page);
  const canTouch = await page.evaluate(() => {
    try {
      void new Touch({identifier: 1, target: document.body});
      return true;
    } catch {
      return false;
    }
  });
  test.skip(!canTouch, 'this engine cannot construct touch events');
  const fire = async (type: string, y: number) =>
    sheet.evaluate(
      (element, {kind, clientY}) => {
        const dialog = element.closest('dialog') as HTMLDialogElement;
        const touch = new Touch({
          identifier: 77,
          target: dialog,
          clientX: 200,
          clientY,
        });
        dialog.dispatchEvent(
          new TouchEvent(kind, {
            bubbles: true,
            cancelable: true,
            touches: kind === 'touchend' ? [] : [touch],
            changedTouches: [touch],
          }),
        );
        if (kind === 'touchend') {
          dialog.dispatchEvent(
            new MouseEvent('click', {bubbles: true, cancelable: true}),
          );
        }
      },
      {kind: type, clientY: y},
    );
  await driver.play(slowDragTo(handle, Math.round((halfTop - tallTop) * 0.66)));
  await waitForAnimation(sheet, {minProgressMs: 40});
  // How far the settle moves in a frame right now, then where it is.
  const before = await sheetTop(sheet);
  await frames(page, 1);
  const drawn = await sheetTop(sheet);
  const perFrame = Math.abs(drawn - before);
  await fire('touchstart', drawn + 20);
  await frames(page, 1);
  const pressed = await sheetTop(sheet);
  await page.waitForTimeout(80);
  const held = await sheetTop(sheet);
  // Caught where it was drawn (within the frame or two the settle moved
  // between the read and the press), and it stays there while held.
  expect(Math.abs(pressed - drawn)).toBeLessThanOrEqual(2 * perFrame + 1);
  expect(Math.abs(held - pressed)).toBeLessThan(0.5);
  // The lift settles it from there, and the tap's click on the dialog is not
  // a scrim tap: the sheet stays open.
  await fire('touchend', pressed + 20);
  await waitForRest(sheet);
  await expect(sheet).toBeVisible();
  expect(await sheet.evaluate(el => el.closest('dialog')?.open)).toBe(true);
});

test('the settle keeps advancing every frame while the main thread is blocked', async ({
  page,
  browserName,
}, testInfo) => {
  const {driver, sheet, tallTop, halfTop, handle} = await openSheet(page);
  await markElement(sheet);
  const cast = await startScreencast(page);
  // The settle must be running (and composited) before the block: an
  // animation cannot start while the main thread is held. Armed before the
  // release, the page waits for the settle itself (the sheet runs no other
  // animation during the drag) and blocks once it has run 16 ms, however busy
  // the machine; armed after, the round trip would leave little of the settle
  // to judge.
  const blocking = blockMainThread(page, 700, {
    during: sheet,
    minProgressMs: 16,
  });
  await driver.play(slowDragTo(handle, Math.round((halfTop - tallTop) * 0.66)));
  const block = await blocking;
  // Where the settle ends, from the page: a frame after the block can still
  // show a stale position (see `settledAt`). The frames track the marker
  // chip, which sits inset in the sheet, so it is the chip's rest: the sheet's
  // own top would end the judged window about 9 px before the settle does.
  await waitForRest(sheet);
  const settledAt = await sheet.evaluate(el => {
    const chip = el.querySelector('[data-harness-marker-chip]');
    if (chip == null) {
      throw new Error('the sheet lost its marker chip');
    }
    return chip.getBoundingClientRect().y;
  });
  const castFrames = await cast.stop();
  const tracked = await trackMarker(page, castFrames);
  // Judge the part of the block during which the settle was still moving:
  // until it is within two of the screencast's position steps of rest
  // (Chromium's are 1 px, WebKit's 2 px). Closer, the spring's tail moves
  // less than a step a frame and shows plateaus: on WebKit, two frames at one
  // 2 px step read as not moved though the sheet never stopped.
  const settledWithin = browserName === 'webkit' ? 4 : 2;
  const proof = busyWindowProof(tracked, block, {settledWithin, settledAt});
  await writeEvidence(
    'busy-main-thread/bottomsheet-settle',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {
          block,
          settledAt,
          proof,
          frames: tracked.map(f => ({
            t: +(f.t - block.from).toFixed(1),
            y: f.box?.y ?? null,
            h: f.box?.height ?? null,
          })),
        },
        null,
        1,
      ),
    },
    testInfo,
  );
  const film = await castStoryboard(page, castFrames, {
    name: 'bottomsheet-settle-busy-main-thread',
    zero: block.from,
    from: block.from - 40,
    to: proof.judged.to + 40,
    columns: 8,
    cellScale: 0.35,
    data: t => ({y: tracked.find(f => f.t === t)?.box?.y ?? -1}),
  });
  await film.write(testInfo, {block, judged: proof.judged});
  testInfo.annotations.push({
    type: 'busy-main-thread',
    description: proof.summary,
  });
  expect(proof.verdict.failures, proof.summary).toEqual([]);
  expect(proof.monotonic).toBe(true);
  // The judged window runs until the marker is within two steps of where it
  // rests.
  const lastJudged = tracked
    .filter(f => f.box != null && f.t <= proof.judged.to)
    .at(-1);
  expect(
    Math.abs((lastJudged?.box?.y ?? Number.NaN) - settledAt),
  ).toBeLessThanOrEqual(settledWithin);
});

test('the settle does no Layout or Paint per frame', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'rendering traces are Chromium-only');
  const {driver, sheet, tallTop, halfTop, handle} = await openSheet(page);
  let settle = {from: 0, to: 0};
  const trace = await traceRendering(page, async () => {
    await driver.play(
      slowDragTo(handle, Math.round((halfTop - tallTop) * 0.66)),
    );
    [settle] = await waitForAnimation(sheet);
    await waitForRest(sheet);
  });
  // The steady part of the settle: its first and last frames may commit.
  const during = countBetween(trace, settle.from + 50, settle.to - 50);
  expect(during.Layout ?? 0, JSON.stringify(during)).toBe(0);
  expect(during.Paint ?? 0, JSON.stringify(during)).toBe(0);
  expect(trace.longTasks).toEqual([]);
});

/**
 * Tiles Chromium's compositor schedules for raster in the page's renderer
 * (cc's `TileManager::ScheduleTasks`), per window between the marks `body`
 * places: `{[mark]: tiles until the next mark}`. A transform or an opacity on
 * a composited layer rasters nothing; a style change that repaints content,
 * or gives an element a layer or takes it away, re-rasters its tiles.
 */
async function traceRasterTiles(
  page: Page,
  body: (mark: (name: string) => Promise<void>) => Promise<void>,
): Promise<Record<string, number>> {
  const cdp = await page.context().newCDPSession(page);
  const events: {
    name: string;
    ts: number;
    pid: number;
    args?: {count?: number};
  }[] = [];
  cdp.on('Tracing.dataCollected', ({value}) => {
    events.push(...(value as unknown as typeof events));
  });
  const complete = new Promise<void>(resolve =>
    cdp.once('Tracing.tracingComplete', () => resolve()),
  );
  await cdp.send('Tracing.start', {
    transferMode: 'ReportEvents',
    traceConfig: {
      includedCategories: ['cc', 'blink.user_timing'],
      excludedCategories: ['*'],
    },
  });
  const tag = `raster-${Math.random().toString(36).slice(2, 8)}`;
  const names: string[] = [];
  const mark = async (name: string) => {
    names.push(name);
    await page.evaluate(n => void performance.mark(n), `${tag}:${name}`);
  };
  try {
    await body(mark);
    await mark('end');
  } finally {
    await cdp.send('Tracing.end');
    await complete;
    await cdp.detach().catch(() => {});
  }
  const marks = names.map(name => {
    const event = events.find(e => e.name === `${tag}:${name}`);
    if (event == null) {
      throw new Error(`traceRasterTiles: the mark "${name}" was not traced`);
    }
    return {name, ts: event.ts, pid: event.pid};
  });
  const tiles: Record<string, number> = {};
  for (let i = 0; i < marks.length - 1; i++) {
    const {name, ts, pid} = marks[i];
    tiles[name] = events
      .filter(
        e =>
          e.name === 'TileManager::ScheduleTasks' &&
          e.pid === pid &&
          e.ts >= ts &&
          e.ts < marks[i + 1].ts,
      )
      .reduce((sum, e) => sum + (e.args?.count ?? 0), 0);
  }
  return tiles;
}

test('a finger dragging the open sheet re-rasters none of it', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'raster traces are Chromium-only');
  // A finger on Android: its selection lock changes no style. On iOS WebKit
  // the lock still turns user-select off on the sheet (the only refusal iOS
  // honors, sheetSelectionLock.ts), which repaints it at the catch and the
  // lift.
  const {driver, sheet, tallTop, handle} = await openSheet(page, {
    idiom: 'android',
  });
  // The presentation's own layer goes this long after it settles.
  await page.waitForTimeout(PROMOTION_LINGER_MS + 100);
  let moving = false;
  const tiles = await traceRasterTiles(page, async mark => {
    await mark('touch-down');
    await driver.play(outAndBack(handle), {
      onEvent: async step => {
        if (step.type === 'touchMove' && !moving) {
          moving = true;
          await mark('moving');
        }
      },
    });
    await waitForRest(sheet);
    // The animator lets the sheet's layer go this long after the settle.
    await page.waitForTimeout(PROMOTION_LINGER_MS + 200);
  });
  expect(await sheetTop(sheet)).toBeCloseTo(tallTop, 0);
  // The touch-down's own frame is excluded: it pins the sheet's height for
  // the drag, as it did before the release rule. From the first move through
  // the settle and its layer's release, nothing may re-raster.
  expect(tiles.moving, JSON.stringify(tiles)).toBe(0);
});

test(
  'storyboard: drag to the half detent and settle',
  {tag: '@storyboard'},
  async ({page}, testInfo) => {
    const {driver, sheet, tallTop, halfTop, handle} = await openSheet(page);
    // Gate the page's timers from here on, so the settle's completion timer can
    // be held with its animation while the filmstrip is photographed.
    await installTimerGate(page);
    const viewport = page.viewportSize() ?? {width: 402, height: 714};
    const clip = {x: 0, y: 0, width: viewport.width, height: viewport.height};
    const dy = Math.round((halfTop - tallTop) * 0.66);
    const measure = async () => ({top: await sheetTop(sheet)});
    const dragBoard = await touchStoryboard(
      page,
      driver,
      drag(
        handle,
        {x: handle.x, y: handle.y + dy},
        {durationMs: 200, hz: 30, restMs: 150},
      ),
      {
        name: 'bottomsheet-drag-to-detent',
        clip,
        measure,
        columns: 5,
        cellScale: 0.4,
      },
    );
    await waitForAnimation(sheet);
    await freezeTimers(page);
    const {storyboard: settleBoard} = await animationStoryboard(page, {
      name: 'bottomsheet-settle',
      clip,
      scope: sheet,
      measure,
      columns: 7,
      cellScale: 0.4,
    });
    await releaseAnimations(page, {finish: true});
    await thawTimers(page);
    await dragBoard.write(testInfo);
    await settleBoard.write(testInfo);
    // The trace is the assertion; the sheets are the evidence.
    const dragTops = dragBoard.frames.map(f => f.data.top as number);
    expect(
      dragTops.every((top, i) => i === 0 || top >= dragTops[i - 1] - 0.5),
    ).toBe(true);
    const settleTops = settleBoard.frames.map(f => f.data.top as number);
    expect(
      settleTops.every((top, i) => i === 0 || top >= settleTops[i - 1] - 0.5),
    ).toBe(true);
    expect(settleTops.at(-1)).toBeCloseTo(halfTop, 0);
  },
);

test(
  'storyboard: a fast throw settles on the 80 % damped spring',
  {tag: '@storyboard'},
  async ({page}, testInfo) => {
    const {driver, sheet, tallTop, halfTop, handle} = await openSheet(page);
    await installTimerGate(page);
    const viewport = page.viewportSize() ?? {width: 402, height: 714};
    const clip = {x: 0, y: 0, width: viewport.width, height: viewport.height};
    const pull = Math.round((halfTop - tallTop) * 0.25);
    await driver.play(
      drag(
        handle,
        {x: handle.x, y: handle.y + pull + 150},
        {
          durationMs: 100 + (pull / 150) * 100,
          hz: 120,
        },
      ),
    );
    await waitForAnimation(sheet);
    await freezeTimers(page);
    const {storyboard} = await animationStoryboard(page, {
      name: 'bottomsheet-fast-throw-settle',
      clip,
      scope: sheet,
      measure: async () => ({top: await sheetTop(sheet)}),
      columns: 8,
      cellScale: 0.35,
    });
    await releaseAnimations(page, {finish: true});
    await thawTimers(page);
    await storyboard.write(testInfo);
    const tops = storyboard.frames.map(f => f.data.top as number);
    // An 80 % damped spring overshoots the detent (by ~1.5 % of the travel
    // for a release from rest; more with the throw's velocity), then settles.
    expect(Math.max(...tops)).toBeGreaterThan(halfTop + 0.5);
    expect(tops.at(-1)).toBeCloseTo(halfTop, 0);
  },
);

/** The duration the sheet's stylesheet gives its `transform` transition, ms. */
async function themeDurationMs(sheet: Locator): Promise<number> {
  return sheet.evaluate(el => {
    const style = getComputedStyle(el);
    const properties = style.transitionProperty.split(',').map(p => p.trim());
    const index = Math.max(0, properties.indexOf('transform'));
    const items = style.transitionDuration.split(',');
    const value = items[index % items.length].trim();
    return value.endsWith('ms')
      ? Number.parseFloat(value)
      : Number.parseFloat(value) * 1000;
  });
}

/** The duration of each animation running on the sheet, ms. */
async function runningDurations(sheet: Locator): Promise<number[]> {
  return sheet.evaluate(el =>
    el
      .getAnimations()
      .map(a => Number(a.effect?.getComputedTiming().duration ?? 0)),
  );
}

test("a finger on Android takes UIKit's release too, not the theme's timing (one touch model)", async ({
  page,
}) => {
  const {driver, sheet, tallTop, halfTop, handle} = await openSheet(page, {
    idiom: 'android',
  });
  const theme = await themeDurationMs(sheet);
  // Two thirds of the way to half, resting before the lift: UIKit's rule
  // lands on half, on the critically damped spring, not the theme's curve.
  await driver.play(slowDragTo(handle, Math.round((halfTop - tallTop) * 0.66)));
  const settle = await runningDurations(sheet);
  expect(settle).toHaveLength(1);
  expect(Math.abs(settle[0] - END_HOLD_MS - theme)).toBeGreaterThan(5);
  await waitForRest(sheet);
  expect(await sheetTop(sheet)).toBeCloseTo(halfTop, 0);
});

test('a flick from tall lands on half on Android too (one touch model)', async ({
  page: firstPage,
}, testInfo) => {
  // Its outcome follows the flick's speed, so WebKit's pacing is checked.
  await retakeOnTouchPacing(testInfo, async attempt => {
    const page = await pageForAttempt(firstPage, attempt);
    const {driver, sheet, halfTop, handle} = await openSheet(page, {
      idiom: 'android',
    });
    // 2000 px/s for 80 ms from tall: a flick, at least to the next detent
    // down, which its projection (160 + 200 px) is nearest too.
    await driver.play(
      flick(handle, {velocity: {x: 0, y: 2000}, durationMs: 80, hz: 120}),
      {checkPacing: true},
    );
    await waitForRest(sheet);
    expect(await sheetTop(sheet)).toBeCloseTo(halfTop, 0);
  });
});

/** Each animation running on the sheet: the properties it changes and its duration (ms). */
async function runningMotion(
  sheet: Locator,
): Promise<{properties: string[]; ms: number}[]> {
  return sheet.evaluate(el =>
    el.getAnimations().map(animation => {
      const frames =
        (animation.effect as KeyframeEffect | null)?.getKeyframes() ?? [];
      const first = (frames[0] ?? {}) as Record<string, unknown>;
      const properties = new Set<string>();
      for (const frame of frames) {
        for (const [key, value] of Object.entries(frame)) {
          const timing = ['offset', 'computedOffset', 'easing', 'composite'];
          if (!timing.includes(key) && String(value) !== String(first[key])) {
            properties.add(key);
          }
        }
      }
      return {
        properties: [...properties],
        ms: Number(animation.effect?.getComputedTiming().duration ?? 0),
      };
    }),
  );
}

for (const idiom of ['ios', 'android'] as const) {
  test(`under reduced motion a touch release cross-fades in place, 200 ms or less (${idiom}; design:reduced-motion DR2)`, async ({
    page,
  }) => {
    await page.emulateMedia({reducedMotion: 'reduce'});
    const {driver, sheet, tallTop, halfTop, handle} = await openSheet(page, {
      idiom,
    });
    await driver.play(
      slowDragTo(handle, Math.round((halfTop - tallTop) * 0.66)),
    );
    // A fade, and nothing that outlasts the record's 200 ms: no spring.
    const motion = await runningMotion(sheet);
    expect(motion.some(m => m.properties.includes('opacity'))).toBe(true);
    expect(motion.every(m => m.ms - END_HOLD_MS <= 200.5)).toBe(true);
    await waitForRest(sheet);
    expect(await sheetTop(sheet)).toBeCloseTo(halfTop, 0);
  });
}
