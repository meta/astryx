// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file BottomSheetDetent.interaction.browser.spec.ts
 * @input The built "Snap points" BottomSheet story, real touch input
 *   (Chromium CDP / WebKit's input command) and the interaction harness
 * @output Interaction and animation proofs for dragging the sheet to a detent.
 *   The drag follows the finger, and a slow release settles on the nearest
 *   detent. A flick dismisses. A softer flick lands on the half detent, also
 *   when one early move arrives late. The settle lands on the detent, its
 *   sampled curve recorded. It keeps advancing every frame through a blocked
 *   main thread, and does no Layout or Paint per frame. A storyboard shows the
 *   drag and the settle.
 * @position The exemplar for `*.interaction.browser.spec.ts`: component lanes
 *   copy this shape. Each test names the instrument it uses from
 *   @astryxdesign/interaction-harness, so the evidence layer is explicit.
 *
 * The settle's curve is recorded, not asserted: today it is the panel's
 * `--ease-standard` CSS transition over `--duration-medium` (SETTLE_EASING and
 * SETTLE_MS below), which starts a release at rest at a speed of its own. The
 * touch model starts it at the finger's speed. When the settle moves to the
 * UIKit spring, `expectedSettle` becomes the spring from the motion constants,
 * and the curve and the velocity hand-off reported below become assertions.
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  animationStoryboard,
  blockMainThread,
  busyWindowProof,
  castStoryboard,
  compareCurve,
  countBetween,
  curveOf,
  drag,
  flick,
  frames,
  freezePageOn,
  holdAnimations,
  installLongTaskLog,
  installPageFreeze,
  installTimerGate,
  markElement,
  openStory,
  readLongTasks,
  readRelease,
  releaseAnimations,
  releaseVelocity,
  sampleCurve,
  startBusyControl,
  startScreencast,
  thawPage,
  timeline,
  timingFunction,
  touchDriver,
  toTouchEvents,
  touchStoryboard,
  traceRendering,
  trackControl,
  trackMarker,
  withStorybook,
  waitForAnimation,
  waitForRest,
  writeEvidence,
  type PlayedEvent,
  type TouchDriver,
  type TouchScript,
} from '@astryxdesign/interaction-harness';
import {resolveSnapPoint} from '../../motion/resolveSnapPoint';
import {sheet as uikitSheet} from '../../motion/uikit/sheet';

const storybook = withStorybook(test);

// How far the dismissing flick's release, as WebKit stamps its touches on
// arrival, may stray from the script's before the play fails by name. 2,000
// px/s from tall, 160 px of travel: the 0.1 s projection passes half above
// 1,409 px/s, so the sheet dismisses.
const DISMISS_FLICK_TOLERANCE = 0.29;

// Core counts a release as a flick only after the drag moved more than this,
// px.
// SYNC: Keep equal to `DRAG_PROMOTION_SLOP` in ../useSheetGestures.ts.
const DRAG_PROMOTION_SLOP_PX = 8;

/** A downward release from tall, its positions in px below tall. */
interface DownwardRelease {
  /** Where the finger lets go. */
  readonly travel: number;
  /** The half detent. */
  readonly half: number;
  /** The dismissed position: the sheet's height on screen at tall. */
  readonly closed: number;
}

const POSITIONS = ['tall', 'half', 'the dismissed position'] as const;

/**
 * Where Core's release rule lands a downward touch release from tall at
 * `speed`, px/s. It calls `resolveSnapPoint` with the arguments
 * `useSheetGestures` passes for a touch release.
 */
function landingOf(
  speed: number,
  {travel, half, closed}: DownwardRelease,
): (typeof POSITIONS)[number] {
  const {fastSpeed, minProjectionSpeed, projectionSeconds, detentTolerance} =
    uikitSheet.release;
  const {index} = resolveSnapPoint({
    points: [0, half, closed],
    position: travel,
    velocity: speed,
    flickThreshold:
      travel > DRAG_PROMOTION_SLOP_PX ? fastSpeed : Number.POSITIVE_INFINITY,
    tolerance: detentTolerance,
    flickPastProjection: true,
    projection: {seconds: projectionSeconds, minSpeed: minProjectionSpeed},
    start: 0,
  });
  return POSITIONS[index];
}

/** How far down the script's finger travels before it lifts, in whole px. */
function travelOf(script: TouchScript): number {
  const ys = toTouchEvents(script)
    .filter(step => step.type === 'touchStart' || step.type === 'touchMove')
    .map(step => Math.round(step.changed[0].y));
  return ys[ys.length - 1] - ys[0];
}

/**
 * The release the page read, px/s, as Core's velocity tracker reads it. In
 * WebKit the touch driver reads it from the page's own event stamps. A page
 * whose listeners take a few ms reads a slower flick than the script's. In
 * Chromium the page reads the script's stamps, so the release is the
 * script's.
 */
function pageRelease(
  script: TouchScript,
  played: ReadonlyArray<PlayedEvent>,
): number {
  const read = played[played.length - 1]?.release;
  if (read != null) {
    return read.pagePxPerS;
  }
  const steps = toTouchEvents(script);
  const reading = readRelease(
    steps,
    steps.map(step => ({stamp: step.t, handledAt: Number.NaN})),
  );
  return reading?.scriptPxPerS ?? Number.NaN;
}

/**
 * Fails by name unless Core's release rule lands the release the page read
 * on half.
 */
function expectLandsOnHalf(speed: number, release: DownwardRelease) {
  const landing = landingOf(speed, release);
  if (landing !== 'half') {
    throw new Error(
      `the page read a release of ${speed.toFixed(0)} px/s, which Core's release rule lands on ${landing}, not half`,
    );
  }
}

/**
 * The slowest release, in whole px/s, from which Core's release rule lands on
 * half for every speed up to `fastest`. The play takes it as a boundary. A
 * page that read the release below it did not receive the soft flick. The
 * play then fails by name, before the proof judges the landing.
 */
function halfFrom(fastest: number, release: DownwardRelease): number {
  if (landingOf(fastest, release) !== 'half') {
    throw new Error(
      `the script's ${fastest.toFixed(0)} px/s lands on ${landingOf(fastest, release)}, so it proves no soft flick`,
    );
  }
  let slowest = Math.floor(fastest);
  while (slowest > 0 && landingOf(slowest - 1, release) === 'half') {
    slowest -= 1;
  }
  return slowest;
}

// The settle's timing, from the theme the story renders in: `--ease-standard`
// is the default cubic-bezier(0.24, 1, 0.4, 1), and `--duration-medium` is the
// neutral theme's motion `medium` (300 ms; the base theme's is 410 ms).
const SETTLE_EASING = 'cubic-bezier(0.24, 1, 0.4, 1)';
const SETTLE_MS = 300;

interface OpenSheet {
  driver: TouchDriver;
  sheet: Locator;
  /** Top of the sheet at its tall detent and at the half-viewport detent, CSS px. */
  tallTop: number;
  halfTop: number;
  /** The viewport's height: a dismissed sheet's top, CSS px. */
  screenHeight: number;
  handle: {x: number; y: number};
}

async function openSheet(page: Page): Promise<OpenSheet> {
  await installLongTaskLog(page);
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
    screenHeight: viewport.height,
    handle: {x: rect.x + rect.width / 2, y: rect.y + 12},
  };
}

// A plain evaluate, not boundingBox(): it must also work while the page's timers are frozen.
const sheetTop = async (sheet: Locator) =>
  sheet.evaluate(el => el.getBoundingClientRect().y);

/** A slow drag that rests before the lift: release velocity 0, so the release projects onto itself. */
function slowDragTo(from: {x: number; y: number}, dy: number) {
  return drag(
    from,
    {x: from.x, y: from.y + dy},
    {durationMs: 400, hz: 60, restMs: 150},
  );
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
  const tops: number[] = [];
  let moves = 0;
  let restingTop = NaN;
  const started = Date.now();
  await driver.play(script, {
    onEvent: async step => {
      if (step.type !== 'touchMove') {
        return;
      }
      // Read right away (moves are paced at 60 Hz), and once more after the
      // last move has been presented: the finger rests 150 ms before lifting.
      tops.push(await sheetTop(sheet));
      if (moves++ === lastMove) {
        await frames(page, 1);
        restingTop = await sheetTop(sheet);
      }
    },
  });
  // The sheet tracked the finger: monotonic, and 1:1 once out of the
  // starting detent's 40 px magnet.
  expect(tops.every((top, i) => i === 0 || top >= tops[i - 1] - 0.5)).toBe(
    true,
  );
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

test('a downward flick dismisses the sheet', async ({page}) => {
  const {driver, handle} = await openSheet(page);
  const script = flick(handle, {
    velocity: {x: 0, y: 2000},
    durationMs: 80,
    hz: 120,
  });
  expect(releaseVelocity(script).y).toBeCloseTo(2000, -1);
  await driver.play(script, {
    pacing: 'spacing',
    releaseTolerance: DISMISS_FLICK_TOLERANCE,
  });
  await expect(page.getByRole('dialog', {name: 'Nearby places'})).toBeHidden();
});

test('a softer downward flick from the tall detent lands on the half detent', async ({
  page,
}) => {
  const {driver, sheet, handle, tallTop, halfTop, screenHeight} =
    await openSheet(page);
  // 1,200 px/s: a flick, whose projection stops short of the half detent, so
  // it goes one stop.
  const script = flick(handle, {
    velocity: {x: 0, y: 1200},
    durationMs: 80,
    hz: 120,
  });
  expect(releaseVelocity(script).y).toBeCloseTo(1200, -1);
  const release = {
    travel: travelOf(script),
    half: halfTop - tallTop,
    closed: screenHeight - tallTop,
  };
  // Below the speed where the landing leaves half, the page did not receive
  // the soft flick. The play then fails by name.
  const played = await driver.play(script, {
    pacing: 'spacing',
    boundaries: {releasePxPerS: halfFrom(releaseVelocity(script).y, release)},
  });
  // The release the page read decides the landing, so the proof asks Core's
  // release rule where that release lands.
  expectLandsOnHalf(pageRelease(script, played), release);
  await waitForRest(sheet);
  await expect(page.getByRole('dialog', {name: 'Nearby places'})).toBeVisible();
  expect(await sheetTop(sheet)).toBeCloseTo(halfTop, 0);
});

test('a softer flick with one early move 70 ms late still lands on the half detent', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'webkit',
    'only WebKit stamps a touch when it arrives; Chromium carries the scripted times',
  );
  const {driver, sheet, handle, tallTop, halfTop, screenHeight} =
    await openSheet(page);
  const script = flick(handle, {
    velocity: {x: 0, y: 1200},
    durationMs: 80,
    hz: 120,
  });
  const release = {
    travel: travelOf(script),
    half: halfTop - tallTop,
    closed: screenHeight - tallTop,
  };
  // The move after this step reaches the page 70 ms late, as a stalled
  // dispatch delivers it. The last two moves keep their spacing.
  const late = toTouchEvents(script).length - 5;
  const played = await driver.play(script, {
    pacing: 'spacing',
    boundaries: {releasePxPerS: halfFrom(releaseVelocity(script).y, release)},
    onEvent: async (_, index) => {
      if (index === late) {
        await new Promise(resolve => setTimeout(resolve, 70));
      }
    },
  });
  expectLandsOnHalf(pageRelease(script, played), release);
  await waitForRest(sheet);
  await expect(page.getByRole('dialog', {name: 'Nearby places'})).toBeVisible();
  expect(await sheetTop(sheet)).toBeCloseTo(halfTop, 0);
});

test("the release check asks Core's rule with the sheet's arguments", () => {
  const long = {travel: 96, half: 300, closed: 650};
  // Below the flick speed the projection decides: 126 px stays nearer tall,
  // 186 px nearer half.
  expect(landingOf(300, long)).toBe('tall');
  expect(landingOf(900, long)).toBe('half');
  // A flick goes at least to half, and on once its projection passes half.
  expect(landingOf(1500, long)).toBe('half');
  expect(landingOf(3000, long)).toBe('the dismissed position');
  // 32 px: a flick lands on half where its projection, 142 px, would not.
  const short = {travel: 32, half: 300, closed: 650};
  expect(landingOf(900, short)).toBe('tall');
  expect(landingOf(1100, short)).toBe('half');
  // 8 px is within Core's drag slop, so 1,100 px/s is no flick there.
  expect(landingOf(1100, {travel: 8, half: 300, closed: 650})).toBe('tall');
  // The boundary a soft flick's play takes: from 540 px/s the projection
  // reaches nearer half. On 32 px only a flick, from 1,008 px/s, lands there.
  expect(halfFrom(1200, long)).toBe(540);
  expect(halfFrom(1100, short)).toBe(1008);
});

test('the settle lands on the detent, its curve recorded frame by frame', async ({
  page,
}, testInfo) => {
  // The page clock that lets the scene stop at the lift, installed before
  // the story loads; a freeze also needs the timer gate.
  await installPageFreeze(page);
  const {driver, sheet, tallTop, halfTop, handle} = await openSheet(page);
  await installTimerGate(page);
  const dy = Math.round((halfTop - tallTop) * 0.66);
  // The scene stops in the lift's own task, before the sheet hears the lift.
  // The settle then starts held, however late this process reacts. A hold
  // that the test sends after the lift can come after the settle ends.
  await freezePageOn(page, 'touchend');
  await driver.play(slowDragTo(handle, dy));
  const held = await holdAnimations(page, sheet, {
    judges: {target: sheet, property: 'transform'},
  });
  const transition = held.find(a => a.name === 'transform');
  if (transition == null) {
    throw new Error(`no transform transition held: ${JSON.stringify(held)}`);
  }
  // The curve is recorded, not asserted: today's settle is the theme's
  // transition, which starts a release at rest at a speed of its own, where
  // the touch model starts it at the finger's; this records what it plays.
  // Seek the held settle to every frame time and read the presented transform.
  const samples = curveOf(
    await sampleCurve(sheet, timeline(SETTLE_MS)),
    'translateY',
  );
  const from = samples[0].value;
  const to = samples[samples.length - 1].value;
  const ease = timingFunction(SETTLE_EASING);
  const expectedSettle = (t: number) =>
    from + (to - from) * ease(Math.min(1, t / SETTLE_MS));
  const result = compareCurve(samples, expectedSettle, 0.5);
  await releaseAnimations(page);
  await thawPage(page);
  testInfo.annotations.push({
    type: 'settle-curve',
    description: `settle: ${transition.easing}, ${transition.durationMs} ms; frame-by-frame max error ${result.maxError.toFixed(2)} px against ${SETTLE_EASING} over ${SETTLE_MS} ms`,
  });
  // UIKit parity metric, reported rather than asserted until the spring lands:
  // the settle's initial velocity, read from its first two frames, vs the
  // finger's at release (here 0).
  const initialVelocity =
    ((samples[1].value - samples[0].value) / (samples[1].t - samples[0].t)) *
    1000;
  testInfo.annotations.push({
    type: 'uikit-parity',
    description: `settle starts at ${initialVelocity.toFixed(0)} px/s for a release at 0 px/s (UIKit hands the release velocity to the spring)`,
  });
  await writeEvidence(
    'curves/bottomsheet-settle',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {transition, comparison: result},
        null,
        2,
      ),
    },
    testInfo,
  );
  // Where it lands is asserted: the half detent.
  expect(samples.at(-1)?.value).toBeCloseTo(halfTop - tallTop, 0);
});

test('the settle keeps advancing every frame while the main thread is blocked', async ({
  page,
  browserName,
}, testInfo) => {
  test.skip(
    browserName === 'webkit',
    'WebKit holds the settle short of its detent until a blocked main thread resumes',
  );
  const {driver, sheet, tallTop, halfTop, handle} = await openSheet(page);
  await markElement(sheet);
  // The harness's busy-window control: a box the compositor moves along the
  // top edge, in the same screencast. The settle is judged against what the
  // compositor presented, not against a frame rate.
  const control = await startBusyControl(page);
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
  await control.remove();
  const tracked = await trackMarker(page, castFrames);
  const controlFrames = await trackControl(
    page,
    castFrames.filter(f => f.t >= block.from - 300 && f.t <= block.to + 100),
  );
  // Judge the part of the block during which the settle was still moving:
  // until it is within 2 px of rest (the screencast rounds to whole pixels,
  // so the easing tail shows plateaus there). The settle moves on every frame
  // the control moves on, and it stalls no longer than the control.
  const proof = busyWindowProof(tracked, block, {
    settledWithin: 2,
    settledAt,
    control: controlFrames,
  });
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
  // The judged window runs until the marker is within 2 px of where it rests.
  const lastJudged = tracked
    .filter(f => f.box != null && f.t <= proof.judged.to)
    .at(-1);
  expect(
    Math.abs((lastJudged?.box?.y ?? Number.NaN) - settledAt),
  ).toBeLessThanOrEqual(2);
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

test(
  'storyboard: drag to the half detent and settle',
  {tag: '@storyboard'},
  async ({page}, testInfo) => {
    // The page clock that lets the scene stop at the lift, installed before
    // the story loads.
    await installPageFreeze(page);
    const {driver, sheet, tallTop, halfTop, handle} = await openSheet(page);
    // Gate the page's timers from here on, so the settle's completion timer can
    // be held with its animation while the filmstrip is photographed.
    await installTimerGate(page);
    const viewport = page.viewportSize() ?? {width: 402, height: 714};
    const clip = {x: 0, y: 0, width: viewport.width, height: viewport.height};
    const dy = Math.round((halfTop - tallTop) * 0.66);
    const measure = async () => ({top: await sheetTop(sheet)});
    // The scene stops in the lift's own task, before the sheet hears the
    // lift. The settle then starts held, however late this process reacts. A
    // hold that the test sends after the lift can come after the settle ends.
    await freezePageOn(page, 'touchend');
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
    const {storyboard: settleBoard} = await animationStoryboard(page, {
      name: 'bottomsheet-settle',
      clip,
      scope: sheet,
      judges: {target: sheet, property: 'transform'},
      measure,
      columns: 7,
      cellScale: 0.4,
    });
    await releaseAnimations(page, {finish: true});
    await thawPage(page);
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
