// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file BottomSheetDetent.interaction.browser.spec.ts
 * @input The built "Snap points" BottomSheet story, real touch input
 *   (Chromium CDP / WebKit's input command) and the interaction harness
 * @output Interaction and animation proofs for dragging the sheet to a
 *   detent: the drag follows the finger and a slow release settles on the
 *   nearest detent; a flick dismisses; the settle's sampled curve matches its
 *   timing function; the settle keeps advancing every frame through a blocked
 *   main thread; the settle does no Layout or Paint per frame; a storyboard of
 *   the drag and the settle.
 * @position The exemplar for `*.interaction.browser.spec.ts`: component lanes
 *   copy this shape. Each test names the instrument it uses from
 *   @astryxdesign/interaction-harness, so the evidence layer is explicit.
 *
 * The expected curve here is today's: the panel's `--ease-standard` CSS
 * transition (cubic-bezier(0.24, 1, 0.4, 1), `--duration-medium` = 410 ms).
 * When the settle moves to the UIKit spring, `expectedSettle` becomes the
 * spring from the motion constants, and the velocity hand-off reported below
 * becomes an assertion.
 */

import {expect, test, type Locator, type Page} from '@playwright/test';
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
  freezeTimers,
  holdAnimations,
  installLongTaskLog,
  installTimerGate,
  markElement,
  openStory,
  readLongTasks,
  releaseAnimations,
  releaseVelocity,
  sampleCurve,
  startScreencast,
  thawTimers,
  timeline,
  timingFunction,
  touchDriver,
  toTouchEvents,
  touchStoryboard,
  traceRendering,
  trackMarker,
  withStorybook,
  waitForAnimation,
  waitForRest,
  writeEvidence,
  type TouchDriver,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

interface OpenSheet {
  driver: TouchDriver;
  sheet: Locator;
  /** Top of the sheet at its tall detent and at the half-viewport detent, CSS px. */
  tallTop: number;
  halfTop: number;
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
  // No long task from the gesture or the settle (the story's own load is excluded).
  expect(await readLongTasks(page, {from: started, to: Date.now()})).toEqual(
    [],
  );
});

test('a downward flick dismisses the sheet', async ({page}) => {
  const {driver, handle} = await openSheet(page);
  const script = flick(handle, {
    velocity: {x: 0, y: 2000},
    durationMs: 80,
    hz: 120,
  });
  expect(releaseVelocity(script).y).toBeCloseTo(2000, -1);
  await driver.play(script);
  await expect(page.getByRole('dialog', {name: 'Nearby places'})).toBeHidden();
});

test('the settle follows its timing function, sampled frame by frame', async ({
  page,
}, testInfo) => {
  const {driver, sheet, tallTop, halfTop, handle} = await openSheet(page);
  const dy = Math.round((halfTop - tallTop) * 0.66);
  await driver.play(slowDragTo(handle, dy));
  const [settle] = await waitForAnimation(sheet);
  const held = await holdAnimations(page, sheet);
  const transition = held.find(a => a.name === 'transform');
  if (transition == null) {
    throw new Error(`no transform transition held: ${JSON.stringify(held)}`);
  }
  // Seek the held settle to every frame time and read the presented transform.
  const samples = curveOf(
    await sampleCurve(sheet, timeline(transition.durationMs)),
    'translateY',
  );
  const from = samples[0].value;
  const to = samples[samples.length - 1].value;
  const ease = timingFunction(transition.easing);
  const expectedSettle = (t: number) =>
    from + (to - from) * ease(Math.min(1, t / transition.durationMs));
  const result = compareCurve(samples, expectedSettle, 0.5);
  await releaseAnimations(page);
  // UIKit parity metric, reported rather than asserted until the spring lands:
  // the settle's initial velocity vs the finger's at release (here 0).
  const initialVelocity = ((expectedSettle(1) - expectedSettle(0)) / 1) * 1000; // px/s over the first ms
  testInfo.annotations.push({
    type: 'uikit-parity',
    description: `settle starts at ${initialVelocity.toFixed(0)} px/s for a release at 0 px/s (UIKit hands the release velocity to the spring)`,
  });
  await writeEvidence(
    'curves/bottomsheet-settle',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {settle, transition, comparison: result},
        null,
        2,
      ),
    },
    testInfo,
  );
  expect(result.maxError, JSON.stringify(result.worst)).toBeLessThanOrEqual(
    0.5,
  );
  expect(samples.at(-1)?.value).toBeCloseTo(halfTop - tallTop, 0);
});

test('the settle keeps advancing every frame while the main thread is blocked', async ({
  page,
}, testInfo) => {
  const {driver, sheet, tallTop, halfTop, handle} = await openSheet(page);
  await markElement(sheet);
  const cast = await startScreencast(page);
  await driver.play(slowDragTo(handle, Math.round((halfTop - tallTop) * 0.66)));
  // The settle must be running (and composited) before the block: an
  // animation cannot start while the main thread is held.
  const [settle] = await waitForAnimation(sheet, {minProgressMs: 16});
  const block = await blockMainThread(page, 700);
  await page.waitForTimeout(150);
  const castFrames = await cast.stop();
  const tracked = await trackMarker(page, castFrames);
  // Judge the part of the block during which the settle was still moving.
  // (until the last pixel: the easing tail moves less than a pixel per frame)
  const proof = busyWindowProof(
    tracked,
    {from: block.from, to: Math.min(block.to, settle.to)},
    {settledWithin: 1},
  );
  await writeEvidence(
    'busy-main-thread/bottomsheet-settle',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {
          block,
          settle,
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
    to: Math.min(block.to, settle.to) + 40,
    columns: 8,
    cellScale: 0.35,
    data: t => ({y: tracked.find(f => f.t === t)?.box?.y ?? -1}),
  });
  await film.write(testInfo, {block, settle});
  expect(proof.medianFrameMs).toBeLessThan(20);
  expect(proof.frames).toBeGreaterThanOrEqual(proof.expectedFrames - 2);
  expect(proof.changed).toBeGreaterThanOrEqual(proof.frames - 3);
  expect(proof.longestStallMs).toBeLessThan(40);
  expect(proof.monotonic).toBe(true);
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
