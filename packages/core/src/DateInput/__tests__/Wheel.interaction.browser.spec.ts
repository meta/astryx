// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Wheel.interaction.browser.spec.ts
 * @input The built "Core/Wheel" stories, real touch input, the interaction
 *   harness, and the Wheel's own physics as the oracle of UIKit's picker
 * @output Interaction and animation proofs for the touch picker wheel: the
 *   coast's curve, its frames through a blocked main thread, a finger's
 *   catch, a storyboard, Reduce Motion, and a mouse drag on today's column
 * @position Browser proof for DateInput/PickerWheel.tsx and the Wheel switch,
 *   run by `pnpm test:interaction`; wheelPhysics.test.ts holds the oracle to
 *   the UIKit recordings
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  advanceFrozenPage,
  animationStoryboard,
  armHold,
  blockMainThread,
  busyWindowProof,
  castStoryboard,
  CONTROL_RGB,
  compareCurve,
  countBetween,
  curveOf,
  flick,
  freezePageOn,
  freezeTimers,
  holdAnimations,
  installPageFreeze,
  installTimerGate,
  markElement,
  openStory,
  releaseAnimations,
  releaseVelocity,
  sampleCurve,
  startBusyControl,
  startCompositorTrace,
  startScreencast,
  tap,
  thawPage,
  thawTimers,
  timeline,
  touchDriver,
  touchStoryboard,
  toTouchEvents,
  traceRendering,
  trackMarker,
  type waitForAnimation,
  waitForRest,
  watchAnimations,
  retakeOnWheelPacing,
  webInputDriver,
  WHEEL_SKIP,
  withStorybook,
  writeEvidence,
  type TouchDriver,
} from '@astryxdesign/interaction-harness';
import {UIKIT_GESTURES} from '../../motion/uikit';
import {WHEEL_ROW_HEIGHT} from '../wheelOptions';
import {planRelease, type WheelLayout} from '../wheelPhysics';
import {VelocityTracker} from '../../gestures/VelocityTracker';

const storybook = withStorybook(test);

const ROW = WHEEL_ROW_HEIGHT;
const MINUTES: WheelLayout = {rowHeight: ROW, rowCount: 60};
const HYSTERESIS = UIKIT_GESTURES.pan.hysteresis.value;
/** A flick up the minute wheel: the rows run on towards higher minutes. */
const FLICK_VELOCITY = 900;
/** The busy-main-thread proof's block: spec:AST-094 FR5's verification. */
const BLOCK_MS = 1000;
/**
 * The rows the busy proof's strip markers sit on, three rows apart in three
 * colours. Two markers of one colour are nine rows apart, never both in sight.
 * Neighbours' reaches overlap by over three rows.
 */
const STRIP_MARKER_ROWS = Array.from({length: 20}, (_, i) => 2 + 3 * i);
const STRIP_MARKER_RGB = [
  [255, 0, 255],
  [255, 255, 0],
  [255, 140, 0],
] as const;
/** How far from the band a strip marker is judged, px: inside the column. */
const STRIP_MARKER_REACH = 92;
/** The shortest stretch of the block one marker is judged over, ms. */
const MIN_REACH_MS = 150;

interface OpenWheel {
  driver: TouchDriver;
  field: Locator;
  minutes: Locator;
  strip: Locator;
  /** Where a finger lands to flick: low on the minute column. */
  start: {x: number; y: number};
}

async function openWheel(page: Page): Promise<OpenWheel> {
  await openStory(page, storybook(), 'core-wheel--minutes');
  const driver = await touchDriver(page);
  const field = page.getByRole('textbox', {name: 'Committed minute'});
  await expect(field).toHaveValue('00');
  const minutes = page.getByRole('listbox', {name: 'Minute'});
  await expect(minutes).toBeVisible();
  await page.waitForTimeout(600);
  // The touch column: a finger gets it on every engine.
  await expect(page.locator('[data-wheel]')).toHaveCount(1);
  // The column fades its rows toward its edges with a mask, which washes out
  // the colour a proof tracks. So the proofs read it unmasked. The mask is
  // static, and the motion is the same either way.
  await minutes.locator('[data-wheel-fade]').evaluate(element => {
    element.style.setProperty('mask-image', 'none');
    element.style.setProperty('-webkit-mask-image', 'none');
  });
  const column = await minutes.boundingBox();
  if (column == null) {
    throw new Error('no minute column');
  }
  await expectRowsPainted(minutes, column);
  return {
    driver,
    field,
    minutes,
    strip: minutes.locator('[data-wheel-strip]'),
    start: {
      x: Math.round(column.x + column.width / 2),
      y: Math.round(column.y + column.height * 0.8),
    },
  };
}

/**
 * Presence first: what a proof tracks is on screen before it acts. The strip
 * and its 60 rows are there, each row a painted box one row tall. The strip is
 * opaque, and the committed row is drawn inside the column. A proof that would
 * pass with nothing painted proves nothing.
 */
async function expectRowsPainted(
  minutes: Locator,
  column: {y: number; height: number},
) {
  const strip = minutes.locator('[data-wheel-strip]');
  await expect(strip).toHaveCount(1);
  await expect(strip).toHaveCSS('opacity', '1');
  await expect(strip).toHaveCSS('visibility', 'visible');
  const rows = minutes.locator('[data-wheel-row]');
  await expect(rows).toHaveCount(MINUTES.rowCount);
  const sizes = await rows.evaluateAll(elements =>
    elements.map(element => {
      const box = element.getBoundingClientRect();
      return {width: box.width, height: box.height};
    }),
  );
  expect(
    sizes.filter(
      ({width, height}) => width > 0 && Math.abs(height - ROW) < 0.5,
    ),
    'every row is a painted row',
  ).toHaveLength(MINUTES.rowCount);
  const committed = minutes.getByRole('option', {selected: true});
  await expect(committed).toBeVisible();
  const box = await committed.boundingBox();
  if (box == null) {
    throw new Error('the committed row has no box');
  }
  expect(
    box.y,
    'the committed row is drawn in the column',
  ).toBeGreaterThanOrEqual(column.y);
  expect(box.y + box.height).toBeLessThanOrEqual(column.y + column.height);
}

/**
 * The flick's script, and the offset the rows show at its lift.
 *
 * WebKit's injected touches carry only real dispatch time (README: engine
 * limits). So the release velocity the page reads from them is only as good as
 * the machine's pace. Under podman `--cpus=3` with 16 workers, the 120 Hz
 * script's moves arrive in bursts and stalls, with `LP_NUM_THREADS=3` too. An
 * A/B in one hour on Oct 31 failed 3 and 6 of 18 runs with it, and 7 and 7
 * without. The median gaps are 1 to 2 ms with stalls up to 73 ms, where the
 * script has 8.3 ms. A failing flick coasts on to the end of the list: 1,687
 * px, where UIKit's plan rests at 719. The proofs that read the coast a flick
 * starts fail there: the UIKit curve, a finger catching the coast and the
 * storyboard. The reduced-motion momentum fails too, without the flag. This is
 * an engine limit of WebKit's real-time input, not a pass. Under the CI WebKit
 * lane's own profile (`--cpus=4`, `LP_NUM_THREADS=4`, `CI=1`, 1 worker, ×10),
 * the moves arrive every 8 ms, at most 11. All 60 runs pass.
 */
function flickUp(start: {x: number; y: number}) {
  const script = flick(start, {
    velocity: {x: 0, y: -FLICK_VELOCITY},
    durationMs: 100,
    hz: 120,
  });
  const events = toTouchEvents(script);
  const moves = events.filter(e => e.type === 'touchMove');
  const last = moves[moves.length - 1];
  const travel = start.y - (last?.fingers[0]?.y ?? start.y);
  // Minute 00 is under the band; the pan begins past its hysteresis, which
  // the rows never show.
  return {script, offsetAtLift: travel - HYSTERESIS};
}

/**
 * The busy-main-thread proof needs a coast as long as the script's release
 * makes it. Where the page sees real dispatch times (WebKit here), the release
 * velocity is the engine's own and can fall under the velocity floor. The
 * screencast's cadence also varies with load. For Mobile Safari there is an iOS
 * simulator capture of a coast through a 530 ms block. There is no real device,
 * and no 1 s block there.
 */
// WebKit's busy-thread run is skipped: lifted under the CI WebKit lane's own
// profile (Oct 31, podman `--cpus=4`, `LP_NUM_THREADS=4`, `CI=1`, ×10), 7 of 10
// runs failed. In 3, WebKit's real-time release was too slow for a coast that
// outlasts the 1 s block. In 4, the coast moved on 94 to 97% of the frames the
// control moved. Its tail moved 1.3 to 2 px a frame, against WebKit's 2 px
// screencast steps. So it runs through the block, finer than the cast shows.
const SCRIPTED_RELEASE_SKIP =
  'the coast needs the scripted release velocity, which only an engine replaying the script timestamps gives, and its tail moves under WebKit\u2019s 2 px screencast step (README: engine limits); Mobile Safari has an iOS simulator capture through a 530 ms block instead';

/** The y of a strip keyframe: the animator plays the strip's `translate`. */
function stripYOf(frame: Record<string, unknown> | undefined): number {
  const translate = frame?.translate;
  if (translate === 'none') {
    return 0;
  }
  if (typeof translate !== 'string') {
    throw new Error(`not a translate keyframe: ${JSON.stringify(frame)}`);
  }
  const [, y = '0px'] = translate.trim().split(/\s+/);
  return Number.parseFloat(y);
}

type WheelAnimation = Awaited<ReturnType<typeof waitForAnimation>>[number];

/**
 * The strip's own animation among those under it: the one whose keyframes
 * are all translations (the rows are flat and never animate).
 */
function stripAnimationOf(animations: WheelAnimation[]): WheelAnimation {
  const strip = animations.find(
    animation =>
      (animation.keyframes ?? []).length > 0 &&
      (animation.keyframes ?? []).every(
        frame => frame.opacity == null && typeof frame.translate === 'string',
      ),
  );
  if (strip == null) {
    throw new Error('no strip animation');
  }
  return strip;
}

/** The strip's translation is minus the wheel's offset. */
/** The strip's running coast, from and to on the page clock, read without
 * its keyframes. */
async function stripCoastTiming(
  strip: Locator,
): Promise<{from: number; to: number}> {
  await expect
    .poll(
      async () =>
        strip.evaluate(element =>
          element
            .getAnimations()
            .some(a => a.playState === 'running' && a.startTime != null),
        ),
      {timeout: 5_000},
    )
    .toBe(true);
  return strip.evaluate(element => {
    const animation = element
      .getAnimations()
      .find(a => a.playState === 'running' && a.startTime != null);
    const effect = animation?.effect as KeyframeEffect | null | undefined;
    const timing = effect?.getComputedTiming();
    const start = performance.timeOrigin + Number(animation?.startTime ?? 0);
    const delay = timing?.delay ?? 0;
    const active = Number(timing?.activeDuration ?? 0);
    // The curve's end, as the harness reads it: the first of the frames
    // that hold the strip's last position (the arrival commits there).
    const frames = effect?.getKeyframes() ?? [];
    let first = frames.length - 1;
    while (
      first > 0 &&
      String(frames[first - 1].translate) === String(frames[first].translate)
    ) {
      first -= 1;
    }
    const linear = (effect?.getTiming().easing ?? 'linear') === 'linear';
    const end = linear ? (frames[first]?.computedOffset ?? 1) * active : active;
    return {from: start + delay, to: start + delay + end};
  });
}

const stripOffset = async (strip: Locator) =>
  strip.evaluate(element => {
    const translate = getComputedStyle(element).translate;
    const [, y = '0px'] =
      translate === 'none' ? [] : translate.trim().split(/\s+/);
    return -Number.parseFloat(y);
  });

/** An input the page received: its type, timestamp (ms) and position. */
type InputSeen = [type: string, time: number, x: number, y: number];

/**
 * Record the inputs a finger's pan reads, before the gesture system sees them.
 * A finger begins with its touchstart and lifts with its touchend. Its moves
 * are its touch `pointermove`s, one sample per event, as the pan takes them.
 * Each time is on the page's clock, as the gesture host reads it.
 */
async function recordFingerInputs(page: Page): Promise<void> {
  await page.evaluate(() => {
    const seen: [string, number, number, number][] = [];
    (window as unknown as {__inputsSeen: typeof seen}).__inputsSeen = seen;
    const timeOf = (event: Event) =>
      event.timeStamp > 1e12
        ? event.timeStamp - performance.timeOrigin
        : event.timeStamp;
    for (const type of ['touchstart', 'touchend']) {
      window.addEventListener(
        type,
        event => {
          const touch = (event as TouchEvent).changedTouches[0];
          if (touch != null) {
            seen.push([type, timeOf(event), touch.clientX, touch.clientY]);
          }
        },
        {capture: true, passive: true},
      );
    }
    window.addEventListener(
      'pointermove',
      event => {
        if (event.pointerType === 'touch' && seen.length > 0) {
          seen.push([
            'pointermove',
            timeOf(event),
            event.clientX,
            event.clientY,
          ]);
        }
      },
      {capture: true, passive: true},
    );
  });
}

async function fingerInputsSeen(page: Page): Promise<InputSeen[]> {
  return page.evaluate(
    () => (window as unknown as {__inputsSeen: InputSeen[]}).__inputsSeen,
  );
}

/**
 * The release velocity (px/s, positive when the rows move up) that the pan's
 * tracker reads from `inputs`, as the wheel's release does. The gesture
 * arena never lets time go backwards, so each time is held at the latest.
 */
function releaseVelocityOf(inputs: ReadonlyArray<InputSeen>): number {
  const tracker = new VelocityTracker();
  let latest = -Infinity;
  for (const [type, time, x, y] of inputs) {
    latest = Math.max(time, latest);
    if (type === 'touchend') {
      return -tracker.scrollVelocity(latest).y;
    }
    tracker.add(x, y, latest);
  }
  throw new Error(`no lift among the inputs: ${JSON.stringify(inputs)}`);
}

test('a flick coasts on UIKit’s curve onto the row it projects, and commits it on arrival', async ({
  page,
  browserName,
}, testInfo) => {
  const {driver, field, strip, start} = await openWheel(page);
  const {script, offsetAtLift} = flickUp(start);
  expect(releaseVelocity(script).y).toBeCloseTo(-FLICK_VELOCITY, -1);
  await recordFingerInputs(page);
  // The wheel ends a coast from a timer: gate the page's timers so the held
  // coast is not ended while it is sampled.
  await installTimerGate(page);
  const watch = await watchAnimations(strip);
  const hold = await armHold(page, strip, {
    judges: {target: strip, property: 'translate'},
    newOnly: true,
  });
  await driver.play(script);
  const held = await hold.held();
  await freezeTimers(page);
  const motion = held.find(animation => animation.kind === 'Animation');
  if (motion == null) {
    throw new Error(`no coast held: ${JSON.stringify(held)}`);
  }
  const samples = curveOf(
    await sampleCurve(strip, timeline(motion.curveEndMs)),
    'translateY',
  ).map(sample => ({t: sample.t, value: -sample.value}));
  await releaseAnimations(page);
  await thawTimers(page);
  const coast = stripAnimationOf(await watch.started());

  const from = samples[0].value;
  const rest = samples[samples.length - 1].value;
  // The page reads the release velocity from the timestamps of the inputs it
  // receives. WebKit stamps each input as it dispatches it, so under load its
  // velocity can differ from the scripted one. The pan's own tracker reads the
  // inputs the page saw. The whole release is UIKit's plan for that velocity:
  // the row projected, and the coast's rate re-solved to stop there.
  const inputs = await fingerInputsSeen(page);
  const pageVelocity = releaseVelocityOf(inputs);
  const plan = planRelease(from, pageVelocity, MINUTES);
  const expected = (t: number) => plan.curve.value(t / 1000);
  const result = compareCurve(samples, expected, 0.75);
  await writeEvidence(
    'curves/wheel-coast',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {
          coast,
          motion,
          offsetAtLift,
          from,
          rest,
          plan: {
            kind: plan.kind,
            index: plan.index,
            duration: plan.curve.duration,
          },
          pageVelocity,
          inputs,
          comparison: result,
        },
        null,
        2,
      ),
    },
    testInfo,
  );
  expect(result.maxError, JSON.stringify(result.worst)).toBeLessThanOrEqual(
    0.75,
  );
  // WebKit's input has integer CSS px and its own timing: within a few px.
  expect(Math.abs(from - offsetAtLift)).toBeLessThan(
    browserName === 'chromium' ? 2 : 24,
  );
  if (browserName === 'chromium') {
    // Chromium replays the script's timestamps, so the page measures the
    // scripted velocity.
    expect(
      Math.abs(pageVelocity - FLICK_VELOCITY) / FLICK_VELOCITY,
    ).toBeLessThan(0.05);
  }
  // The last sample is half a millisecond before the end.
  expect(Math.abs(rest - plan.index * ROW)).toBeLessThan(0.5);
  if (browserName === 'chromium') {
    // UIKit's coast takes about 2.2 s from 900 pt/s.
    expect(motion.curveEndMs).toBeGreaterThan(1800);
    expect(motion.curveEndMs).toBeLessThan(2700);
  }
  // Committed on arrival, not before.
  await waitForRest(strip);
  await expect(field).toHaveValue(
    String(Math.round(rest / ROW)).padStart(2, '0'),
  );
});

test('the coast keeps advancing every frame while the main thread is blocked', async ({
  page,
}, testInfo) => {
  const {driver, minutes, strip, start} = await openWheel(page);
  test.skip(!driver.scriptedTimestamps, SCRIPTED_RELEASE_SKIP);
  // Markers riding the strip itself, every few rows in three colours. They move
  // with the coast and never turn or fade as the rows do, so their steps are
  // the coast's own. They are placed before the flick, so the block meets them
  // already on screen.
  await strip.evaluate(
    (element, {rows, rowHeight, colours}) => {
      rows.forEach((row, i) => {
        const marker = document.createElement('div');
        marker.dataset.busyMarker = String(row);
        const [r, g, b] = colours[i % colours.length];
        Object.assign(marker.style, {
          position: 'absolute',
          insetInlineStart: '8px',
          insetBlockStart: `${row * rowHeight + (rowHeight - 16) / 2}px`,
          inlineSize: '16px',
          blockSize: '16px',
          backgroundColor: `rgb(${r}, ${g}, ${b})`,
          zIndex: '2147483647',
          pointerEvents: 'none',
        });
        element.append(marker);
      });
    },
    {rows: STRIP_MARKER_ROWS, rowHeight: ROW, colours: STRIP_MARKER_RGB},
  );
  // Presence first: the markers ride the strip, and those in the column are
  // painted there before the flick.
  const markers = strip.locator('[data-busy-marker]');
  await expect(markers).toHaveCount(STRIP_MARKER_ROWS.length);
  const columnBox = await minutes.boundingBox();
  if (columnBox == null) {
    throw new Error('no minute column');
  }
  expect(
    await markers.evaluateAll(
      (elements, column) =>
        elements.filter(element => {
          const box = element.getBoundingClientRect();
          return (
            box.width > 0 &&
            box.height > 0 &&
            box.top >= column.y &&
            box.bottom <= column.y + column.height
          );
        }).length,
      columnBox,
    ),
    'a marker is painted in the column',
  ).toBeGreaterThan(0);
  // A compositor-only control in the page's top edge, recorded in the same
  // frames: the coast is judged against what this machine presented.
  const control = await startBusyControl(page);
  const {script} = flickUp(start);
  const cast = await startScreencast(page);
  // The compositor's own record of the frames it presents: a frame the
  // screencast skips under load is not a stall (busyWindowProof).
  const compositor = await startCompositorTrace(page);
  const watch = await watchAnimations(strip);
  await driver.play(script);
  const coast = stripAnimationOf(await watch.started({minProgressMs: 16}));
  // Read the coast the page is playing, from its keyframes: where the strip is
  // at each moment. WebKit's real-time input gives the page its own release
  // velocity.
  const points = (coast.keyframes ?? []).map(frame => ({
    t: Number(frame.computedOffset ?? frame.offset) * coast.durationMs,
    offset: -stripYOf(frame),
  }));
  const rest = points[points.length - 1].offset;
  const when = (distance: number) =>
    points.find(point => rest - point.offset <= distance)?.t ??
    coast.durationMs;
  // A 1 s block, as spec:AST-094 FR5's proof names, ending while the coast is
  // still over a row from rest.
  const blockTo = when(1.25 * ROW);
  const blockFrom = blockTo - BLOCK_MS;
  expect(blockFrom, 'the coast runs the whole block').toBeGreaterThan(0);
  await page.waitForTimeout(Math.max(0, coast.from + blockFrom - Date.now()));
  const block = await blockMainThread(page, BLOCK_MS);
  await page.waitForTimeout(150);
  const presented = await compositor.stop();
  const castFrames = await cast.stop();
  const tracks: Awaited<ReturnType<typeof trackMarker>>[] = [];
  for (const rgb of STRIP_MARKER_RGB) {
    tracks.push(await trackMarker(page, castFrames, {rgb}));
  }
  const controlFrames = await trackMarker(page, castFrames, {
    rgb: CONTROL_RGB,
  });
  await control.remove();
  // Every marker colour, and the control, is in the recorded frames.
  tracks.forEach((track, i) =>
    expect(
      track.some(frame => frame.box != null),
      `marker colour ${i} is in the frames`,
    ).toBe(true),
  );
  expect(
    controlFrames.some(frame => frame.box != null),
    'the control is in the frames',
  ).toBe(true);
  // Each marker is judged while it is within reach of the band, inside the
  // column. Neighbours' reaches overlap. So a marker in sight for only a sliver
  // of the block is left out where its neighbour covers that time.
  const end = Math.min(block.to, coast.to);
  const at = (offset: number) =>
    coast.from +
    (points.find(point => point.offset >= offset)?.t ?? coast.durationMs);
  const reaches = STRIP_MARKER_ROWS.map((row, i) => ({
    row,
    track: i % STRIP_MARKER_RGB.length,
    from: Math.max(block.from, at(row * ROW - STRIP_MARKER_REACH)),
    to: Math.min(end, at(row * ROW + STRIP_MARKER_REACH)),
  })).filter(reach => reach.to - reach.from >= MIN_REACH_MS);
  // Together the judged reaches cover the whole block.
  let covered = block.from;
  for (const reach of reaches) {
    expect(reach.from, 'the markers cover the block').toBeLessThanOrEqual(
      covered,
    );
    covered = Math.max(covered, reach.to);
  }
  expect(covered, 'the markers cover the block').toBeGreaterThanOrEqual(end);
  const proofs = reaches.map(({track, from, to}) =>
    busyWindowProof(
      tracks[track],
      {from, to},
      {presented, control: controlFrames},
    ),
  );
  await writeEvidence(
    'busy-main-thread/wheel-coast',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {
          block,
          coast,
          reaches,
          proofs,
          frames: tracks[0].map((f, i) => ({
            t: +(f.t - block.from).toFixed(1),
            y: tracks.map(track => track[i]?.box?.y ?? null),
          })),
        },
        null,
        1,
      ),
    },
    testInfo,
  );
  const film = await castStoryboard(page, castFrames, {
    name: 'wheel-coast-busy-main-thread',
    zero: block.from,
    from: block.from - 40,
    to: end + 40,
    columns: 8,
    cellScale: 0.35,
    data: t =>
      Object.fromEntries(
        tracks.map((track, i) => [
          `y${i}`,
          track.find(f => f.t === t)?.box?.y ?? -1,
        ]),
      ),
  });
  await film.write(testInfo, {block, coast});
  // Judged against the control: the coast moved on every frame the control
  // moved, and its longest stall is no longer than the control's. On the
  // coast's slowing tail it moves under one cast step a frame. So a run of
  // unchanged frames that a single step ends counts as moved there. A frozen
  // coast ends its run in a catch-up of many steps, or never moves while the
  // control does.
  for (const proof of proofs) {
    expect(proof.verdict.failures, proof.summary).toEqual([]);
    expect(proof.control?.moved).toBeGreaterThanOrEqual(4);
    expect(proof.monotonic).toBe(true);
  }
});

test('the coast does no Layout or Paint per frame', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'rendering traces are Chromium-only');
  const {driver, strip, start} = await openWheel(page);
  const {script} = flickUp(start);
  let coast = {from: 0, to: 0};
  const trace = await traceRendering(page, async () => {
    await driver.play(script);
    // The strip's own timing only. Describing every row's baked keyframes
    // (waitForAnimation) is itself a DevTools task of nearly 50 ms on the
    // page's main thread. The long-task check would count it.
    coast = await stripCoastTiming(strip);
    await waitForRest(strip);
  });
  // Presence first: the window is a real coast, which ran and moved the rows.
  expect(coast.to - coast.from, 'the coast ran').toBeGreaterThan(500);
  expect(await stripOffset(strip), 'the rows travelled').toBeGreaterThanOrEqual(
    3 * ROW,
  );
  const during = countBetween(trace, coast.from + 50, coast.to - 50);
  expect(during.Layout ?? 0, JSON.stringify(during)).toBe(0);
  expect(during.Paint ?? 0, JSON.stringify(during)).toBe(0);
  expect(trace.longTasks).toEqual([]);
});

test('a finger landing on the coasting wheel stops it where it is, then it eases onto the nearest row', async ({
  page,
}) => {
  await installPageFreeze(page);
  const {driver, field, strip, start} = await openWheel(page);
  await installTimerGate(page);
  const before = await stripOffset(strip);
  const watch = await watchAnimations(strip);
  // The flick plays on the scene's clock. Frozen from its first touch, the
  // scene moves on by each step's scripted time. So the page reads the
  // script's release however loaded the runner is.
  const {script} = flickUp(start);
  const times = toTouchEvents(script).map(step => step.t);
  await freezePageOn(page, 'touchstart');
  await driver.play(script, {
    onEvent: async (_step, index) => {
      if (index + 1 < times.length) {
        await advanceFrozenPage(page, times[index + 1] - times[index]);
      }
    },
  });
  // The coast starts held at the lift. The scene moves 300 ms into it, and
  // the finger lands there.
  await advanceFrozenPage(page, 300);
  const coast = stripAnimationOf(await watch.started({minProgressMs: 16}));
  const coastEnd = -stripYOf(coast.keyframes?.at(-1));
  // Land and hold still: the wheel stops at once, between rows.
  const hold = tap(start, {holdMs: 300});
  let caught = NaN;
  let held = NaN;
  let step = 0;
  await driver.play(hold, {
    onEvent: async () => {
      if (step++ === 0) {
        await thawPage(page);
        await page.waitForTimeout(50);
        caught = await stripOffset(strip);
        await page.waitForTimeout(150);
        held = await stripOffset(strip);
      }
    },
  });
  // Presence first: the wheel was moving when the finger landed.
  expect(caught, 'it moved before the catch').toBeGreaterThan(before + ROW);
  expect(held).toBeCloseTo(caught, 0);
  // It was caught mid-run, short of where the coast was heading.
  expect(caught).toBeLessThan(coastEnd - ROW / 2);
  // Lifted without moving: no tap on the touched row, a snap to the nearest.
  await waitForRest(strip);
  const rested = await stripOffset(strip);
  expect(rested % ROW).toBe(0);
  expect(Math.abs(rested - caught)).toBeLessThanOrEqual(ROW / 2);
  await expect(field).toHaveValue(String(rested / ROW).padStart(2, '0'));
});

test(
  'storyboard: a flick and its coast onto a row',
  {tag: '@storyboard'},
  async ({page}, testInfo) => {
    await installPageFreeze(page);
    const {driver, minutes, strip, start} = await openWheel(page);
    const box = await minutes.boundingBox();
    if (box == null) {
      throw new Error('no minute column');
    }
    const clip = {
      x: Math.max(0, box.x - 160),
      y: box.y - 20,
      width: Math.min(402, box.width + 320),
      height: box.height + 40,
    };
    const measure = async () => ({offset: await stripOffset(strip)});
    const {script} = flickUp(start);
    // The wheel ends a motion from a timer; gate the page's timers so the
    // held coast is not finished behind the filmstrip's back.
    await installTimerGate(page);
    // Frozen in the lift's own task, the coast starts held at its start, and
    // the hold takes it there however long the flick's film took.
    await freezePageOn(page, 'touchend');
    const flickBoard = await touchStoryboard(page, driver, script, {
      name: 'wheel-flick',
      clip,
      measure,
      columns: 6,
      cellScale: 0.5,
    });
    const held = await holdAnimations(page, strip, {
      judges: {target: strip, property: 'translate'},
    });
    await thawPage(page);
    await freezeTimers(page);
    const {storyboard: coastBoard} = await animationStoryboard(page, {
      held,
      name: 'wheel-coast',
      clip,
      measure,
      columns: 8,
      cellScale: 0.5,
    });
    await releaseAnimations(page, {finish: true});
    await thawTimers(page);
    await flickBoard.write(testInfo);
    await coastBoard.write(testInfo);
    // The trace is the assertion; the sheets are the evidence.
    const offsets = coastBoard.frames.map(f => f.data.offset as number);
    expect(offsets.every((o, i) => i === 0 || o >= offsets[i - 1] - 0.5)).toBe(
      true,
    );
    const last = offsets.at(-1) ?? NaN;
    expect(Math.abs(last - Math.round(last / ROW) * ROW)).toBeLessThan(0.5);
    // It decelerates: each frame covers no more than the one before.
    const steps = offsets.slice(1).map((o, i) => o - offsets[i]);
    expect(steps.every((s, i) => i === 0 || s <= steps[i - 1] + 0.5)).toBe(
      true,
    );
  },
);

/**
 * Records every animation under `column`, every frame: its animated
 * properties, length, translations, opacities and keyframe offsets. It also
 * records whether it animates a row, and when it started (epoch ms, once its
 * start time resolves).
 */
async function recordAnimations(column: Locator) {
  await column.evaluate(element => {
    const seen = new Map<
      Animation,
      {
        props: string[];
        duration: number;
        translates: string[];
        opacities: number[];
        offsets: number[];
        isRow: boolean;
        startedAt: number | null;
      }
    >();
    (window as unknown as {wheelAnimations: typeof seen}).wheelAnimations =
      seen;
    const startOf = (animation: Animation) =>
      animation.startTime == null
        ? null
        : performance.timeOrigin + Number(animation.startTime);
    const sample = () => {
      for (const animation of document.getAnimations()) {
        const effect = animation.effect;
        if (!(effect instanceof KeyframeEffect)) {
          continue;
        }
        const target = effect.target;
        if (target == null || !element.contains(target)) {
          continue;
        }
        const known = seen.get(animation);
        if (known != null) {
          known.startedAt ??= startOf(animation);
          continue;
        }
        const props = new Set<string>();
        const translates: string[] = [];
        const opacities: number[] = [];
        const offsets: number[] = [];
        for (const frame of effect.getKeyframes()) {
          offsets.push(frame.computedOffset);
          for (const key of Object.keys(frame)) {
            if (
              !['offset', 'computedOffset', 'easing', 'composite'].includes(key)
            ) {
              props.add(key);
            }
          }
          if (frame.translate != null) {
            translates.push(String(frame.translate));
          }
          if (frame.opacity != null) {
            opacities.push(Number(frame.opacity));
          }
        }
        seen.set(animation, {
          props: [...props],
          duration: Number(effect.getTiming().duration),
          translates,
          opacities,
          offsets,
          isRow:
            target instanceof Element && target.matches('[data-wheel-row]'),
          startedAt: startOf(animation),
        });
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  return async () =>
    column.page().evaluate(() => [
      ...(
        window as unknown as {
          wheelAnimations: Map<
            unknown,
            {
              props: string[];
              duration: number;
              translates: string[];
              opacities: number[];
              offsets: number[];
              isRow: boolean;
              startedAt: number | null;
            }
          >;
        }
      ).wheelAnimations.values(),
    ]);
}

test('under reduced motion, a flick still coasts as momentum, its rows flat', async ({
  page,
}) => {
  // design:reduced-motion DR2: the momentum that continues a throw is direct
  // movement, not a transition, so it coasts as scrolling does.
  await page.emulateMedia({reducedMotion: 'reduce'});
  const {driver, field, minutes, start} = await openWheel(page);
  const read = await recordAnimations(minutes);
  await driver.play(flickUp(start).script);
  await expect(field).not.toHaveValue('00', {timeout: 4000});
  const seen = await read();
  // The strip coasts: a translation longer than any cross-fade.
  const coasts = seen.filter(animation =>
    animation.props.includes('translate'),
  );
  expect(coasts.length).toBeGreaterThan(0);
  expect(
    Math.max(...coasts.map(animation => animation.duration)),
  ).toBeGreaterThan(200);
  // Nothing fades, and the rows stay flat: no animation reaches a row.
  for (const animation of seen) {
    expect(animation.props).not.toContain('opacity');
    expect(animation.isRow).toBe(false);
  }
});

test('under reduced motion, a tap cross-fades onto its row: nothing travels, in 200 ms or less', async ({
  page,
}) => {
  // design:reduced-motion DR2: a transition the wheel starts, here a tap's
  // turn, is the animator's cross-fade. The strip's opacity dips out and back
  // in, 200 ms in all. Its rows land on their row while it is faded out, as a
  // style write with no animation. So nothing is seen to travel.
  await page.emulateMedia({reducedMotion: 'reduce'});
  const {driver, field, minutes} = await openWheel(page);
  const read = await recordAnimations(minutes);
  const box = await minutes.boundingBox();
  if (box == null) {
    throw new Error('no minute column');
  }
  // Two rows below the band: minute 02.
  await driver.tap({
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2 + 2 * ROW),
  });
  await expect(field).toHaveValue('02', {timeout: 3000});
  const seen = await read();
  expect(seen.length).toBeGreaterThan(0);
  // No travel: every animation is an opacity fade.
  for (const animation of seen) {
    expect(animation.props).toEqual(['opacity']);
  }
  // Each half of the dip changes over 100 ms or less; the rest of each
  // animation holds its last value.
  for (const {opacities, offsets, duration} of seen) {
    let held = opacities.length - 1;
    while (held > 0 && opacities[held - 1] === opacities[held]) {
      held -= 1;
    }
    expect(offsets[held] * duration).toBeLessThanOrEqual(100 + 1);
  }
  expect(
    seen.some(({opacities}) => opacities.includes(0)),
    'the strip faded out',
  ).toBe(true);
});

test('under reduced motion, a tap’s cross-fade never shows the old row again while the main thread is blocked', async ({
  page,
  browserName,
}) => {
  // design:reduced-motion DR2 with spec:AST-094 FR5: the strip fades out on the
  // compositor. It holds faded out through a main-thread block across the
  // fade's midpoint, so no frame brings the old row back. The animator lands
  // the row as the main thread runs again, and the strip fades back in on it.
  test.skip(
    browserName !== 'chromium',
    'the screencast proof runs on Chromium; WebKit runs the landing case above',
  );
  await page.emulateMedia({reducedMotion: 'reduce'});
  const {driver, field, minutes, strip} = await openWheel(page);
  const box = await minutes.boundingBox();
  if (box == null) {
    throw new Error('no minute column');
  }
  const target = minutes.getByRole('option', {name: '01'});
  await markElement(target);
  const chip = page.locator('[data-harness-marker-chip]');
  const from = await chip.boundingBox();
  const cast = await startScreencast(page);
  // The fade lasts 200 ms, less than a busy machine's round trip from the test.
  // The animator also cancels each half once it has retired it. So the page
  // records the strip's animations from before the tap. It starts the block
  // itself once the cross-fade has run a frame on the compositor
  // (blockMainThread's `during`). The block then covers the fade's midpoint and
  // its end, however late the test reads them.
  const read = await recordAnimations(minutes);
  const blocking = blockMainThread(page, 700, {during: strip});
  // The row below the band, minute 01, in sight before and after (today’s
  // rows fade toward the edges).
  await driver.tap({
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2 + ROW),
  });
  const block = await blocking;
  // The fade out: the opacity animation the tap started, falling to 0.
  const fade = (await read()).find(
    animation => animation.opacities.includes(0) && animation.startedAt != null,
  );
  if (fade?.startedAt == null) {
    throw new Error('no cross-fade');
  }
  const fadeMs = 200;
  const midpoint = fade.startedAt + fadeMs / 2;
  // Presence first: the block spans the fade's midpoint, where the animator
  // lands the row.
  expect(
    block.from,
    'the block starts before the fade’s midpoint',
  ).toBeLessThan(midpoint);
  expect(block.to, 'the block ends after the fade’s midpoint').toBeGreaterThan(
    midpoint,
  );
  await page.waitForTimeout(150);
  const frames = await cast.stop();
  await expect(field).toHaveValue('01', {timeout: 3000});
  const to = await chip.boundingBox();
  if (from == null || to == null) {
    throw new Error('no marker');
  }
  expect(Math.abs(to.y - from.y), 'the row moved to the band').toBeGreaterThan(
    ROW / 2,
  );
  // Every frame with the row in sight after the fade's midpoint has the row at
  // the band, through the block and after it. The old row never comes back.
  const tracked = await trackMarker(page, frames);
  const afterMidpoint = tracked.filter(
    frame => frame.box != null && frame.t >= midpoint + 10,
  );
  const timeline = tracked
    .map(
      frame =>
        `+${Math.round(frame.t - block.from)}:${frame.box == null ? '-' : Math.round(frame.box.y)}`,
    )
    .join(' ');
  expect(
    afterMidpoint.length,
    `frames with the row in sight (${timeline})`,
  ).toBeGreaterThan(0);
  for (const frame of afterMidpoint) {
    expect(
      Math.abs((frame.box?.y ?? Infinity) - to.y),
      `the row at +${Math.round(frame.t - block.from)} ms, at rest y ${Math.round(to.y)} (${timeline})`,
    ).toBeLessThan(3);
  }
});

test.describe('a mouse wheel and a trackpad (component:DateInput FR15)', () => {
  test('one mouse-wheel notch turns the touch column one row, as an arrow key does; three turn it three', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      "a mouse wheel's notch is Chromium's driver's wheel; WebKit's sends a trackpad's precise deltas, from a desktop context only",
    );
    const {field, minutes} = await openWheel(page);
    const input = await webInputDriver(page);
    test.skip(!input.wheels, WHEEL_SKIP);
    const box = await minutes.boundingBox();
    if (box == null) {
      throw new Error('no minute column');
    }
    const at = {x: box.x + box.width / 2, y: box.y + box.height / 2};
    await input.wheel({...at, dy: 100});
    // As an arrow key: the next row commits at once, with no coast.
    await expect(field).toHaveValue('01');
    await input.wheel({...at, dy: 100});
    await input.wheel({...at, dy: 100});
    await expect(field).toHaveValue('03');
    await page.waitForTimeout(600);
    await expect(field).toHaveValue('03');
    // A ctrl-wheel is the page's zoom: the wheel keeps its row.
    await input.wheel({...at, dy: 100, ctrl: true});
    await page.waitForTimeout(600);
    await expect(field).toHaveValue('03');
  });

  test.describe('a trackpad', () => {
    // WebKit's driver sends a trackpad's precise deltas from a desktop
    // context; the touch column is opened alone there.
    test.use({hasTouch: false, isMobile: false});

    async function openTouchColumn(page: Page) {
      await openStory(page, storybook(), 'core-wheel--touch-minutes');
      const field = page.getByRole('textbox', {name: 'Committed minute'});
      await expect(field).toHaveValue('00');
      const minutes = page.getByRole('listbox', {name: 'Minute'});
      await expect(minutes).toBeVisible();
      await expect(page.locator('[data-wheel]')).toHaveCount(1);
      await page.waitForTimeout(600);
      const box = await minutes.boundingBox();
      if (box == null) {
        throw new Error('no minute column');
      }
      return {
        field,
        at: {x: box.x + box.width / 2, y: box.y + box.height / 2},
      };
    }

    test('a trackpad flick drives the touch column as a finger does: it follows, coasts on at the lift, and commits the row it rests on', async ({
      page,
      browserName,
    }, testInfo) => {
      test.skip(
        browserName !== 'webkit',
        "Chromium's driver sends each wheel as a mouse wheel's notch; only WebKit's sends a trackpad's precise deltas",
      );
      await retakeOnWheelPacing(testInfo, async () => {
        const {field, at} = await openTouchColumn(page);
        const input = await webInputDriver(page);
        test.skip(!input.wheels, WHEEL_SKIP);
        // The fingers: 12 px a frame for 12 frames (144 px, five rows and a
        // bit), then the platform's momentum, a shrinking run.
        const fingers = Array.from({length: 12}, () => ({dy: 12}));
        const momentum = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map(dy => ({dy}));
        await input.wheelBurst({
          ...at,
          steps: [...fingers, ...momentum],
          maxGapMs: 100,
        });
        // It coasts on at UIKit's deceleration, well past the fingers'
        // travel and the momentum's (66 px), and commits where it rests.
        await expect
          .poll(async () => Number(await field.inputValue()), {timeout: 8000})
          .toBeGreaterThanOrEqual(10);
        const rested = await field.inputValue();
        await page.waitForTimeout(1000);
        await expect(field).toHaveValue(rested);
      });
    });

    test('a slow trackpad drag that stops rests on the nearest row, without coasting', async ({
      page,
      browserName,
    }, testInfo) => {
      test.skip(
        browserName !== 'webkit',
        "Chromium's driver sends each wheel as a mouse wheel's notch; only WebKit's sends a trackpad's precise deltas",
      );
      await retakeOnWheelPacing(testInfo, async () => {
        const {field, at} = await openTouchColumn(page);
        const input = await webInputDriver(page);
        test.skip(!input.wheels, WHEEL_SKIP);
        // 2 px a frame for 20 frames: 40 px, a row and a half less a bit.
        await input.wheelBurst({
          ...at,
          steps: Array.from({length: 20}, () => ({dy: 2})),
          maxGapMs: 100,
        });
        await expect(field).toHaveValue('01', {timeout: 5000});
        await page.waitForTimeout(1000);
        await expect(field).toHaveValue('01');
      });
    });
  });
});

test.describe('under a mouse', () => {
  // A desktop: today's column.
  test.use({hasTouch: false, isMobile: false});

  test('a drag scrolls today’s column onto a row and commits it', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'one engine is enough for the fine-pointer path, which is main’s column',
    );
    await openStory(page, storybook(), 'core-wheel--minutes');
    // A mouse case runs under a fine primary pointer: the page agrees.
    expect(
      await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches),
    ).toBe(false);
    const field = page.getByRole('textbox', {name: 'Committed minute'});
    await expect(field).toHaveValue('00');
    const minutes = page.getByRole('listbox', {name: 'Minute'});
    await expect(minutes).toBeVisible();
    // Today's column, not the touch one.
    await expect(page.locator('[data-wheel]')).toHaveCount(0);
    await page.waitForTimeout(600);
    const row = await minutes
      .locator('[role="option"]')
      .first()
      .evaluate(el => el.getBoundingClientRect().height);
    const box = await minutes.boundingBox();
    if (box == null) {
      throw new Error('no minute column');
    }
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    // Up three rows and a little: the content follows the hand.
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 30; i++) {
      await page.waitForTimeout(16);
      await page.mouse.move(x, y - ((3 * row + 8) * i) / 30);
    }
    await page.waitForTimeout(200);
    await page.mouse.up();
    // The column snaps onto a row and commits it.
    await expect(field).not.toHaveValue('00', {timeout: 5000});
    await expect
      .poll(
        async () =>
          minutes.evaluate((el, pitch) => {
            const rows = el.scrollTop / pitch;
            return Math.abs(rows - Math.round(rows));
          }, row),
        {timeout: 5000},
      )
      .toBeLessThan(0.05);
  });
});
